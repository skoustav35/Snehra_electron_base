import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import { BuildArtifact } from '../shims/db-models';
import { Event } from '../shims/event-store';
import type { IEvent } from '../shims/event-store';
import { AdminConfig } from '../shims/admin-config';
import { eventStore } from '../shims/event-store';
import { EventType } from '../shims/events';
import { artifactScanner } from '../shims/artifact-scanner';
import { BuildArtifactService } from './build-artifact.service';
import { CodeSmithWorkspaceManager } from './workspace-manager';
import { pluginManager } from '../shims/plugin-manager';
import { TerminalRunner } from './terminal-runner';
import type { CodeSmithContext } from './types';
import { inferAgentKey, inferRole } from './agent-catalog';
const contextEventPayloadSchema = z.record(z.unknown());

function trimLog(value: string, max: number = 24000): string {
    if (!value) return '';
    return value.length <= max ? value : value.slice(value.length - max);
}

export class CodeSmithWorkspaceService {
    public static async maybeScheduleCleanup(
        execution_id: string,
        workspace_id: string,
        user_id: string
    ): Promise<void> {
        const cleanup = AdminConfig.getWorkspaceCleanupPolicy();
        const enabled = cleanup.enabled;
        if (!enabled) {
            return;
        }

        const delaySeconds = cleanup.delay_seconds;
        await eventStore.appendEvent({
            execution_id,
            workspace_id,
            user_id,
            agent_id: null,
            event_type: EventType.WORKSPACE_CLEANUP_SCHEDULED,
            payload: { delay_seconds: delaySeconds }
        });

        setTimeout(async () => {
            try {
                CodeSmithWorkspaceManager.cleanupExecutionWorkspace(workspace_id, execution_id);
                await eventStore.appendEvent({
                    execution_id,
                    workspace_id,
                    user_id,
                    agent_id: null,
                    event_type: EventType.WORKSPACE_CLEANED,
                    payload: { cleaned: true }
                });
            } catch (error) {
                await eventStore.appendEvent({
                    execution_id,
                    workspace_id,
                    user_id,
                    agent_id: null,
                    event_type: EventType.SECURITY_ALERT,
                    payload: {
                        reason: 'workspace_cleanup_failed',
                        error: error instanceof Error ? error.message : String(error)
                    }
                });
            }
        }, delaySeconds * 1000);
    }

    public static async getFileTree(execution_id: string, relativePath: string = ''): Promise<string[]> {
        const created = await eventStore.getLatestEvent(execution_id, EventType.EXECUTION_CREATED);
        if (!created) {
            throw new Error(`Execution not found: ${execution_id}`);
        }
        const paths = CodeSmithWorkspaceManager.getExecutionPaths(created.workspace_id, execution_id);
        const root = relativePath
            ? CodeSmithWorkspaceManager.resolveWithinWorkspace(paths.root, relativePath)
            : paths.root;
        if (!paths.root) return [];
        try {
            await fs.access(root);
        } catch {
            return [];
        }
        return CodeSmithWorkspaceManager.listTree(paths.root, relativePath);
    }

    public static async getFileContent(execution_id: string, relativePath: string): Promise<string> {
        const created = await eventStore.getLatestEvent(execution_id, EventType.EXECUTION_CREATED);
        if (!created) {
            throw new Error(`Execution not found: ${execution_id}`);
        }
        const paths = CodeSmithWorkspaceManager.getExecutionPaths(created.workspace_id, execution_id);
        const filePath = CodeSmithWorkspaceManager.resolveWithinWorkspace(paths.root, relativePath);
        try {
            await fs.access(filePath);
        } catch {
            throw new Error(`File not found: ${relativePath}`);
        }
        return fs.readFile(filePath, 'utf8');
    }

    public static async listBuildArtifacts(execution_id: string): Promise<unknown[]> {
        return BuildArtifact.find({ execution_id }).sort({ created_at: -1 }).exec();
    }

    public static async listExecutionLogs(execution_id: string, limit: number = 500): Promise<unknown[]> {
        return Event.find({ execution_id })
            .sort({ sequence: -1 })
            .limit(limit)
            .exec();
    }

    public static async replayExecution(execution_id: string): Promise<{
        files_replayed: number;
        commands_replayed: number;
        artifacts_persisted: number;
    }> {
        const created = await eventStore.getLatestEvent(execution_id, EventType.EXECUTION_CREATED);
        if (!created) {
            throw new Error(`Execution not found: ${execution_id}`);
        }

        const workspace_id = created.workspace_id;
        const user_id = created.user_id;

        CodeSmithWorkspaceManager.cleanupExecutionWorkspace(workspace_id, execution_id);
        const paths = CodeSmithWorkspaceManager.ensureExecutionWorkspace(workspace_id, execution_id);

        await eventStore.appendEvent({
            execution_id,
            workspace_id,
            user_id,
            agent_id: null,
            event_type: EventType.EXECUTION_REPLAY_STARTED,
            payload: {}
        });

        const fileEvents = await eventStore.getEventsByType(execution_id, [EventType.FILE_UPDATED]);
        let filesReplayed = 0;
        for (const event of fileEvents) {
            const payload = contextEventPayloadSchema.parse(event.payload);
            const relPath = String(payload.path || '');
            const content = payload.content;
            if (!relPath || typeof content !== 'string') {
                continue;
            }
            const absPath = CodeSmithWorkspaceManager.resolveWithinWorkspace(paths.root, relPath);
            await fs.mkdir(path.dirname(absPath), { recursive: true });
            await fs.writeFile(absPath, content, 'utf8');
            filesReplayed += 1;
        }

        const commandEvents = await eventStore.getEventsByType(execution_id, [EventType.COMMAND_STARTED]);
        let commandsReplayed = 0;
        for (const event of commandEvents) {
            const payload = contextEventPayloadSchema.parse(event.payload);
            const command = String(payload.command || '').trim();
            if (!command) continue;
            const result = await TerminalRunner.runCommand({
                execution_id,
                workspace_id,
                user_id,
                agent_id: null,
                workspace_root: paths.root,
                command
            });
            commandsReplayed += 1;
            if (result.timed_out || result.exit_code !== 0) {
                throw new Error(`Replay command failed: ${command}`);
            }
        }

        const persisted = await BuildArtifactService.persistBuildArtifacts({
            execution_id,
            workspace_id,
            user_id,
            workspace_root: paths.root,
            agent_id: null
        });

        await eventStore.appendEvent({
            execution_id,
            workspace_id,
            user_id,
            agent_id: null,
            event_type: EventType.EXECUTION_REPLAY_COMPLETED,
            payload: {
                files_replayed: filesReplayed,
                commands_replayed: commandsReplayed,
                artifacts_persisted: persisted
            }
        });

        return {
            files_replayed: filesReplayed,
            commands_replayed: commandsReplayed,
            artifacts_persisted: persisted
        };
    }

    public static async hydrateExecutionContext(execution_id: string): Promise<CodeSmithContext> {
        const events = await eventStore.getEvents(execution_id);
        if (events.length === 0) {
            throw new Error(`Execution not found: ${execution_id}`);
        }

        const created = events.find((event) => event.event_type === EventType.EXECUTION_CREATED);
        if (!created) {
            throw new Error(`Execution started event missing for ${execution_id}`);
        }

        const workspace_id = created.workspace_id;
        const user_id = created.user_id;
        const paths = await this.ensureWorkspaceInitialized(execution_id, workspace_id, user_id);

        const ctx: CodeSmithContext = {
            execution_id,
            workspace_id,
            user_id,
            workspace_root: paths.root,
            architect_notes: '',
            planning_notes: '',
            latest_diff_summary: '',
            latest_command_log: '',
            latest_failure: '',
            specialist_notes: {},
            dag_state: {},
            completed_nodes: [],
            failed_nodes: [],
            file_structure_diff: {},
            build_status: 'unknown'
        };

        const streamByAgent: Record<string, string> = {};
        for (const event of events) {
            this.applyContextEvent(ctx, event, streamByAgent);
        }

        for (const [agent_id, streamText] of Object.entries(streamByAgent)) {
            if (!streamText) continue;
            const agentKey = inferAgentKey({ agent_id });
            if (agentKey) {
                ctx.specialist_notes[agentKey] = streamText;
            }
            const role = inferRole({ agent_id }, agentKey);
            if (role === 'architect') {
                ctx.architect_notes = [ctx.architect_notes, streamText].filter(Boolean).join('\n\n');
                ctx.planning_notes = [ctx.planning_notes, streamText].filter(Boolean).join('\n\n');
            }
        }

        if (ctx.build_status === 'unknown') {
            ctx.build_status = 'idle';
        }

        return ctx;
    }

    private static async ensureWorkspaceInitialized(
        execution_id: string,
        workspace_id: string,
        user_id: string
    ) {
        const paths = CodeSmithWorkspaceManager.ensureExecutionWorkspace(workspace_id, execution_id);
        const existing = await eventStore.getLatestEvent(execution_id, EventType.WORKSPACE_INITIALIZED);
        if (!existing) {
            await eventStore.appendEvent({
                execution_id,
                workspace_id,
                user_id,
                agent_id: null,
                event_type: EventType.WORKSPACE_INITIALIZED,
                payload: {
                    root: paths.root,
                    src: paths.src,
                    build: paths.build
                }
            });

            await pluginManager.bootstrap({
                execution_id,
                workspace_id,
                user_id,
                workspace_root: paths.root,
                policy: AdminConfig.getSnapshot(),
                budget: AdminConfig.getCostLimits(workspace_id)
            });
        }
        return paths;
    }

    private static applyContextEvent(
        ctx: CodeSmithContext,
        event: IEvent,
        streamByAgent: Record<string, string>
    ): void {
        const eventType = String(event.event_type);
        const payload = contextEventPayloadSchema.parse(event.payload || {});
        const agentId = event.agent_id ? String(event.agent_id) : '';
        const timestamp = event.timestamp instanceof Date
            ? event.timestamp.toISOString()
            : new Date(event.timestamp || Date.now()).toISOString();

        if (eventType === EventType.AGENT_STARTED && agentId) {
            ctx.dag_state[agentId] = {
                status: 'running',
                started_at: timestamp
            };
            return;
        }

        if (eventType === EventType.AGENT_COMPLETED && agentId) {
            const prior = ctx.dag_state[agentId] || { status: 'pending' as const };
            ctx.dag_state[agentId] = {
                ...prior,
                status: 'completed',
                completed_at: timestamp
            };
            if (!ctx.completed_nodes.includes(agentId)) {
                ctx.completed_nodes.push(agentId);
            }
            return;
        }

        if ((eventType === EventType.AGENT_FAILED || eventType === EventType.EXECUTION_FAILED) && agentId) {
            const prior = ctx.dag_state[agentId] || { status: 'pending' as const };
            ctx.dag_state[agentId] = {
                ...prior,
                status: 'failed',
                completed_at: timestamp
            };
            if (!ctx.failed_nodes.includes(agentId)) {
                ctx.failed_nodes.push(agentId);
            }
            if (typeof payload.error === 'string' && payload.error) {
                ctx.latest_failure = String(payload.error);
            }
            return;
        }

        if (eventType === EventType.FILE_UPDATED || eventType === EventType.FILE_WRITTEN) {
            const filePath = String(payload.path || '');
            if (filePath) {
                ctx.file_structure_diff[filePath] = {
                    version: typeof payload.version === 'number' ? payload.version : undefined,
                    language: typeof payload.language === 'string' ? payload.language : undefined,
                    size_bytes: typeof payload.size_bytes === 'number' ? payload.size_bytes : undefined,
                    updated_at: timestamp
                };
                const version = typeof payload.version === 'number' ? payload.version : null;
                ctx.latest_diff_summary = version !== null ? `${filePath}@v${version}` : filePath;
            }
            return;
        }

        if (eventType === EventType.COMMAND_STARTED || eventType === EventType.COMMAND_EXECUTED || eventType === EventType.COMMAND_EXITED) {
            const command = String(payload.command || '');
            if (command) {
                ctx.latest_command_log = trimLog(`${ctx.latest_command_log}\n$ ${command}`);
            }

            if (eventType === EventType.COMMAND_STARTED) {
                ctx.build_status = 'running';
                return;
            }

            const succeeded = payload.succeeded === true
                || (payload.timed_out !== true && Number(payload.exit_code) === 0);
            ctx.build_status = succeeded ? 'success' : 'failed';
            if (!succeeded && command) {
                ctx.latest_failure = `Command failed: ${command}`;
            }
            return;
        }

        if (eventType === EventType.COMMAND_OUTPUT) {
            const chunk = typeof payload.chunk === 'string' ? payload.chunk : '';
            if (chunk) {
                ctx.latest_command_log = trimLog(`${ctx.latest_command_log}\n${chunk}`);
            }
            return;
        }

        if (eventType === EventType.STREAM_TEXT && agentId) {
            const chunk = typeof payload.chunk === 'string' ? payload.chunk : '';
            const merged = trimLog(`${streamByAgent[agentId] || ''}${chunk}`, 64000);
            streamByAgent[agentId] = merged;
            void artifactScanner.scan({
                artifact_id: `${ctx.execution_id}:stream:${agentId}`,
                workspace_id: ctx.workspace_id,
                execution_id: ctx.execution_id,
                user_id: ctx.user_id,
                file_path: `.codesmith/streams/${agentId}.log`,
                content: merged,
                metadata: {
                    source: 'event_stream',
                    chunk_chars: 2000,
                    chunk_overlap_chars: 160
                }
            });
            return;
        }
        if (eventType === EventType.EXECUTION_ABORTED || eventType === EventType.EXECUTION_FAILED) {
            const reason = payload.reason || payload.error;
            if (reason) {
                ctx.latest_failure = String(reason);
            }
        }
    }
}
