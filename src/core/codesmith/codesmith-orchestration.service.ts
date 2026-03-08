import { promises as fs } from 'fs';
import { z } from 'zod';
import type { IAgentConfig } from '../shims/db-models';
import { RuntimeEnv } from '../shims/runtime-env';
import { AdminConfig } from '../shims/admin-config';
import { AdminConfigService } from '../shims/admin-config-service';
import { ModelResolver } from '../shims/model-resolver';
import { artifactScanner } from '../shims/artifact-scanner';
import { eventStore } from '../shims/event-store';
import { EventType } from '../shims/events';
import { BuildArtifactService } from './build-artifact.service';
import { CodeArtifactParser } from './code-artifact-parser';
import { prunePromptToWindow, resolvePromptTokenBudget } from './context-window';
import { CodeSmithWorkspaceManager } from './workspace-manager';
import type { CodeSmithAgentKey } from './agent-catalog';
import type { CodeSmithAgentPolicy, CodeSmithContext, CodeSmithTool, ExecutionConfig } from './types';
import type { CoreTool } from 'ai';
import { pluginManager } from '../shims/plugin-manager';
import { PreviewRunner } from './preview-runner';
import { TerminalRunner } from './terminal-runner';
import { WorkspaceTools } from './workspace-tools';

const commandsSchema = z.array(z.string().min(1));
const promptSchema = z.string();
const clarificationSchema = z.object({
    clarification: z.string().trim().min(1)
}).passthrough();

function trimLog(value: string, max: number = 24000): string {
    if (!value) return '';
    return value.length <= max ? value : value.slice(value.length - max);
}

export class CodeSmithOrchestrationService {
    public static async applyFix(
        ctx: CodeSmithContext,
        agentConfig: IAgentConfig,
        config: ExecutionConfig,
        fixAttempt: number,
        policy: CodeSmithAgentPolicy | null,
        agentKey: CodeSmithAgentKey | null
    ): Promise<void> {
        this.assertToolAllowed(policy, 'list_dir', agentConfig.agent_id);
        this.assertToolAllowed(policy, 'write_file', agentConfig.agent_id);
        const tree = await this.safeTree(ctx, policy, agentConfig.agent_id);
        const prompt = [
            `You are ${agentConfig.name || 'CodeSmith fixer'}.`,
            `Agent key: ${agentKey || 'unknown'}`,
            `Fix attempt: ${fixAttempt}`,
            `Original request: ${config.query}`,
            'Failure logs:',
            trimLog(ctx.latest_failure, 8000),
            'Recent workspace tree:',
            tree || '(empty)',
            'Recent file diff summary:',
            ctx.latest_diff_summary || '(none)',
            'Return patch artifacts only, as JSON {"artifacts":[...]} or fenced blocks with explicit path hints.',
            'For existing files, prefer unified diffs and set update_mode="unified_diff" in JSON artifacts.'
        ].join('\n');

        const result = await this.callModel(ctx, agentConfig, config, prompt, policy);
        await this.streamText(ctx, agentConfig.agent_id, result.response);

        const artifacts = CodeArtifactParser.parse(result.response, agentConfig.agent_id);
        for (const artifact of artifacts) {
            await WorkspaceTools.writeFile({
                execution_id: ctx.execution_id,
                workspace_id: ctx.workspace_id,
                user_id: ctx.user_id,
                agent_id: agentConfig.agent_id,
                workspace_root: ctx.workspace_root,
                relative_path: artifact.path,
                content: artifact.content,
                language: artifact.language,
                update_mode: artifact.update_mode
            });
        }
        ctx.latest_diff_summary = artifacts.map((artifact) => artifact.path).join(', ');
        if (agentKey) {
            ctx.specialist_notes[agentKey] = `Applied ${artifacts.length} patch artifact(s)`;
        }
    }

    public static async runBuildPipeline(
        ctx: CodeSmithContext,
        agent_id: string,
        policy: CodeSmithAgentPolicy | null
    ): Promise<{ commands: string[] }> {
        this.assertToolAllowed(policy, 'run_command', agent_id);
        this.assertToolAllowed(policy, 'read_file', agent_id);
        const packageJsonPath = CodeSmithWorkspaceManager.resolveWithinWorkspace(ctx.workspace_root, 'package.json');
        try {
            await fs.access(packageJsonPath);
        } catch {
            throw new Error('Build pipeline requires package.json in workspace root');
        }

        const pkgContent = await fs.readFile(packageJsonPath, 'utf8');
        const pkg = JSON.parse(pkgContent) as {
            scripts?: Record<string, string>;
            packageManager?: string;
        };
        const scripts = pkg.scripts || {};
        const pm = this.detectPackageManager(pkg.packageManager);

        const commands: string[] = [];
        commands.push(this.pmCommand(pm, 'install'));
        if (!scripts.build) {
            throw new Error('Build pipeline requires "build" script in package.json');
        }
        commands.push(this.pmCommand(pm, 'build'));
        if (RuntimeEnv.getBoolean('CODESMITH_RUN_TESTS', true) && scripts.test) {
            commands.push(this.pmCommand(pm, 'test'));
        }

        const buildHookCtx: {
            execution_id: string;
            workspace_id: string;
            user_id: string;
            agent_id: string;
            workspace_root: string;
            commands: string[];
            policy: unknown;
            budget: unknown;
        } = {
            execution_id: ctx.execution_id,
            workspace_id: ctx.workspace_id,
            user_id: ctx.user_id,
            agent_id,
            workspace_root: ctx.workspace_root,
            commands: [...commands],
            policy: AdminConfig.getSnapshot(),
            budget: AdminConfig.getCostLimits(ctx.workspace_id)
        };
        await pluginManager.onBeforeBuild(buildHookCtx);

        const validatedCommands = commandsSchema.safeParse(buildHookCtx.commands);
        const commandsToRun = validatedCommands.success && validatedCommands.data.length > 0
            ? validatedCommands.data
            : commands;

        let lastLog = '';
        for (const command of commandsToRun) {
            const run = await TerminalRunner.runCommand({
                execution_id: ctx.execution_id,
                workspace_id: ctx.workspace_id,
                user_id: ctx.user_id,
                agent_id,
                workspace_root: ctx.workspace_root,
                command
            });

            lastLog = trimLog(`${run.stdout}\n${run.stderr}`);
            ctx.latest_command_log = lastLog;
            if (run.timed_out || run.exit_code !== 0) {
                throw new Error(`Command failed: ${command}\n${trimLog(lastLog, 12000)}`);
            }
        }

        const persisted = await BuildArtifactService.persistBuildArtifacts({
            execution_id: ctx.execution_id,
            workspace_id: ctx.workspace_id,
            user_id: ctx.user_id,
            workspace_root: ctx.workspace_root,
            agent_id
        });

        if (AdminConfig.isPreviewEnabled(ctx.workspace_id)) {
            try {
                const preview = await PreviewRunner.ensurePreview(ctx.execution_id);
                await eventStore.appendEvent({
                    execution_id: ctx.execution_id,
                    workspace_id: ctx.workspace_id,
                    user_id: ctx.user_id,
                    agent_id,
                    event_type: EventType.PREVIEW_STATUS,
                    payload: {
                        status: preview.status,
                        build_artifacts: persisted,
                        preview_url: preview.preview_url,
                        port: preview.port
                    }
                });
            } catch (error) {
                await eventStore.appendEvent({
                    execution_id: ctx.execution_id,
                    workspace_id: ctx.workspace_id,
                    user_id: ctx.user_id,
                    agent_id,
                    event_type: EventType.PREVIEW_STATUS,
                    payload: {
                        status: 'error',
                        build_artifacts: persisted,
                        error: error instanceof Error ? error.message : String(error)
                    }
                });
            }
        }

        return { commands: commandsToRun };
    }

    public static collectNotes(ctx: CodeSmithContext, keys: CodeSmithAgentKey[]): string {
        const lines: string[] = [];
        for (const key of keys) {
            const note = ctx.specialist_notes[key];
            if (note) {
                lines.push(`## ${key}`);
                lines.push(trimLog(note, 4000));
            }
        }
        return lines.join('\n');
    }

    public static async safeTree(
        ctx: CodeSmithContext,
        policy: CodeSmithAgentPolicy | null,
        agent_id: string
    ): Promise<string> {
        if (policy && this.isToolAllowed(policy, 'list_dir')) {
            await WorkspaceTools.listDir({
                execution_id: ctx.execution_id,
                workspace_id: ctx.workspace_id,
                user_id: ctx.user_id,
                agent_id,
                workspace_root: ctx.workspace_root
            });
        }

        const entries = CodeSmithWorkspaceManager.listTree(ctx.workspace_root)
            .filter((entry) => !entry.startsWith('node_modules/') && !entry.startsWith('node_modules'))
            .slice(0, 400);
        return entries.join('\n');
    }

    public static async callModel(
        ctx: CodeSmithContext,
        agentConfig: IAgentConfig,
        config: ExecutionConfig,
        prompt: string,
        policy: CodeSmithAgentPolicy | null,
        tools?: Record<string, CoreTool<any, any>>,
        maxSteps?: number
    ) {
        const modelHookCtx: {
            execution_id: string;
            workspace_id: string;
            user_id: string;
            agent_id: string;
            prompt: string;
            policy: unknown;
            budget: unknown;
        } = {
            execution_id: ctx.execution_id,
            workspace_id: config.workspace_id,
            user_id: config.user_id,
            agent_id: agentConfig.agent_id,
            prompt,
            policy: AdminConfig.getSnapshot(),
            budget: AdminConfig.getCostLimits(config.workspace_id)
        };
        await pluginManager.onAgentMessage(modelHookCtx);

        const promptResult = promptSchema.safeParse(modelHookCtx.prompt);
        const resolvedPrompt = promptResult.success ? promptResult.data : prompt;
        const maxPromptTokens = resolvePromptTokenBudget(RuntimeEnv.getNumber('CODESMITH_MAX_PROMPT_TOKENS', 8000));
        const compression = artifactScanner.compressWorkspaceContext({
            workspace_id: ctx.workspace_id,
            query: config.query,
            max_tokens: Math.max(300, Math.floor(maxPromptTokens * 0.2)),
            max_chunks: 24
        });
        const promptWithIndexedContext = compression.summary
            ? `${resolvedPrompt}\n\n[Indexed workspace context]\n${compression.summary}`
            : resolvedPrompt;
        const promptWindow = prunePromptToWindow(promptWithIndexedContext, maxPromptTokens);

        if (compression.included_chunks > 0) {
            await eventStore.appendEvent({
                execution_id: ctx.execution_id,
                workspace_id: ctx.workspace_id,
                user_id: ctx.user_id,
                agent_id: agentConfig.agent_id,
                event_type: EventType.ACTION_TIMELINE,
                payload: {
                    type: 'context_indexed',
                    indexed_chunks: compression.included_chunks,
                    indexed_tokens: compression.token_estimate,
                    max_prompt_tokens: maxPromptTokens
                }
            });
        }

        if (promptWindow.trimmed) {
            await eventStore.appendEvent({
                execution_id: ctx.execution_id,
                workspace_id: ctx.workspace_id,
                user_id: ctx.user_id,
                agent_id: agentConfig.agent_id,
                event_type: EventType.ACTION_TIMELINE,
                payload: {
                    type: 'context_pruned',
                    estimated_tokens: promptWindow.estimated_tokens,
                    trimmed_tokens: promptWindow.trimmed_tokens,
                    max_prompt_tokens: maxPromptTokens
                }
            });
        }

        return ModelResolver.callModel({
            execution_id: ctx.execution_id,
            workspace_id: config.workspace_id,
            user_id: config.user_id,
            agent_id: agentConfig.agent_id,
            execution_type: config.mode,
            prompt: promptWindow.prompt,
            preferred_model: policy?.model || agentConfig.model_preference || undefined,
            max_tokens: policy?.maxTokens || agentConfig.model_config?.max_tokens || 2000,
            cost_multiplier: policy?.creditMultiplier || 1,
            system_prompt: agentConfig.system_prompt || undefined,
            require_real_model: true,
            model_config: agentConfig.model_config || undefined,
            tools,
            maxSteps
        });
    }

    public static isToolAllowed(policy: CodeSmithAgentPolicy | null, tool: CodeSmithTool): boolean {
        if (!policy) return true;
        return AdminConfigService.isCodeSmithToolAllowed(policy, tool);
    }

    public static assertToolAllowed(
        policy: CodeSmithAgentPolicy | null,
        tool: CodeSmithTool,
        agent_id: string
    ): void {
        if (!this.isToolAllowed(policy, tool)) {
            throw new Error(`CodeSmith agent '${agent_id}' cannot use tool '${tool}' by admin policy`);
        }
    }

    public static async streamText(
        ctx: CodeSmithContext,
        agent_id: string,
        text: string
    ): Promise<void> {
        if (!text) return;
        const chunkSize = 120;
        for (let i = 0; i < text.length; i += chunkSize) {
            const chunk = text.slice(i, i + chunkSize);
            await eventStore.appendEvent({
                execution_id: ctx.execution_id,
                workspace_id: ctx.workspace_id,
                user_id: ctx.user_id,
                agent_id,
                event_type: EventType.STREAM_TEXT,
                payload: {
                    chunk,
                    is_final: i + chunkSize >= text.length
                }
            });
        }
    }

    public static extractClarificationText(raw: string): string {
        const value = String(raw || '').trim();
        if (!value) {
            return 'No clarification content returned. Continue with minimal assumptions and document any risk.';
        }

        try {
            const parsed = clarificationSchema.safeParse(JSON.parse(value) as unknown);
            if (parsed.success) {
                return parsed.data.clarification;
            }
        } catch {
            // Non-JSON clarification is expected in most responses.
        }

        const fenceMatch = value.match(/```(?:json|txt|md)?\s*([\s\S]*?)```/i);
        if (fenceMatch && fenceMatch[1].trim()) {
            return fenceMatch[1].trim();
        }
        return value;
    }

    private static pmCommand(pm: 'npm' | 'pnpm' | 'yarn', action: 'install' | 'build' | 'test'): string {
        if (action === 'install') return 'npm install';
        if (action === 'build') return 'npm run build';
        return 'npm test';
    }

    private static detectPackageManager(value?: string): 'npm' | 'pnpm' | 'yarn' {
        const normalized = (value || '').toLowerCase();
        if (normalized.startsWith('pnpm')) return 'pnpm';
        if (normalized.startsWith('yarn')) return 'yarn';
        return 'npm';
    }
}
