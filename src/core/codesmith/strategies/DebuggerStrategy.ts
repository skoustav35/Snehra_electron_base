import { Tracing } from '../../shims/tracing';
import { RuntimeEnv } from '../../shims/runtime-env';
import { eventStore } from '../../shims/event-store';
import { EventType } from '../../shims/events';
import type { IAgentConfig } from '../../shims/db-models';
import type { CodeSmithContext, ExecutionConfig, CodeSmithAgentPolicy, CodeSmithAgentKey } from '../types';
import { CodeSmithRuntimeUtils } from '../utils/CodeSmithRuntimeUtils';
import { ArtifactVersionService } from '../artifact-version.service';
import type { AgentStrategy } from './AgentStrategy';

export class DebuggerStrategy implements AgentStrategy {
    async execute(
        ctx: CodeSmithContext,
        agentConfig: IAgentConfig,
        config: ExecutionConfig,
        started: number,
        policy: CodeSmithAgentPolicy | null,
        agentKey: CodeSmithAgentKey | null
    ): Promise<{ summary: string; duration_ms: number }> {
        return Tracing.withSpan(
            'codesmith.debugger.execute',
            {
                execution_id: ctx.execution_id,
                workspace_id: ctx.workspace_id,
                user_id: ctx.user_id,
                agent_id: String(agentConfig.agent_id || '')
            },
            async () => {
                CodeSmithRuntimeUtils.assertToolAllowed(policy, 'run_command', agentConfig.agent_id);
                CodeSmithRuntimeUtils.assertToolAllowed(policy, 'read_file', agentConfig.agent_id);
                CodeSmithRuntimeUtils.assertToolAllowed(policy, 'write_file', agentConfig.agent_id);

                const maxFixAttempts = Math.max(0, RuntimeEnv.getNumber('CODESMITH_DEBUGGER_MAX_ATTEMPTS', 2));
                let attempt = 0;
                let latestError = String(ctx.latest_failure || '').trim();

                while (attempt <= maxFixAttempts) {
                    if (latestError) {
                        await CodeSmithRuntimeUtils.applyFix(
                            ctx,
                            agentConfig,
                            config,
                            attempt + 1,
                            policy,
                            agentKey
                        );
                    }

                    try {
                        const pipeline = await CodeSmithRuntimeUtils.runBuildPipeline(
                            ctx,
                            agentConfig.agent_id,
                            policy
                        );
                        ctx.latest_failure = '';
                        if (agentKey) {
                            ctx.specialist_notes[agentKey] = [
                                `Debugger recovered build in ${attempt + 1} attempt(s).`,
                                `Commands: ${pipeline.commands.join(' -> ')}`
                            ].join('\n');
                        }
                        return {
                            summary: `debugger_passed:${attempt + 1}`,
                            duration_ms: Date.now() - started
                        };
                    } catch (error) {
                        latestError = error instanceof Error ? error.message : String(error);
                        ctx.latest_failure = latestError;
                        attempt += 1;
                        if (attempt > maxFixAttempts) {
                            break;
                        }
                    }
                }

                if (RuntimeEnv.getBoolean('CODESMITH_AUTO_ROLLBACK_ON_DEBUGGER_FAILURE', true)) {
                    try {
                        const rollback = await ArtifactVersionService.rollbackLatestRevisionSet({
                            execution_id: ctx.execution_id,
                            workspace_root: ctx.workspace_root
                        });

                        await eventStore.appendEvent({
                            execution_id: ctx.execution_id,
                            workspace_id: ctx.workspace_id,
                            user_id: ctx.user_id,
                            agent_id: agentConfig.agent_id,
                            event_type: EventType.ACTION_TIMELINE,
                            payload: {
                                type: 'auto_rollback',
                                restored_files: rollback.restored_files,
                                removed_files: rollback.removed_files,
                                skipped_files: rollback.skipped_files,
                                reason: latestError
                            }
                        });

                        if (agentKey) {
                            ctx.specialist_notes[agentKey] = [
                                ctx.specialist_notes[agentKey] || '',
                                `Auto-rollback applied after debugger failure: restored ${rollback.restored_files}, removed ${rollback.removed_files}, skipped ${rollback.skipped_files}.`
                            ].filter(Boolean).join('\n');
                        }
                    } catch (rollbackError) {
                        await eventStore.appendEvent({
                            execution_id: ctx.execution_id,
                            workspace_id: ctx.workspace_id,
                            user_id: ctx.user_id,
                            agent_id: agentConfig.agent_id,
                            event_type: EventType.ACTION_TIMELINE,
                            payload: {
                                type: 'auto_rollback_failed',
                                reason: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
                            }
                        });
                    }
                }

                throw new Error(`Debugger failed after ${maxFixAttempts + 1} attempt(s): ${latestError || 'unknown error'}`);
            }
        );
    }
}
