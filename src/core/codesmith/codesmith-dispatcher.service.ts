import { z } from 'zod';
import { RuntimeEnv } from '../shims/runtime-env';
import { AdminConfig } from '../shims/admin-config';
import { AdminConfigService } from '../shims/admin-config-service';
import { ModelResolver } from '../shims/model-resolver';
import { Tracing } from '../shims/tracing';
import { eventStore } from '../shims/event-store';
import { EventType } from '../shims/events';
import { logger } from '../shims/logger';
import type { IAgentConfig } from '../shims/db-models';
import {
    inferAgentKey as inferCatalogAgentKey,
    inferRole as inferCatalogRole,
    type CodeSmithRole
} from './agent-catalog';
import {
    type CodeSmithAgentKey,
    type CodeSmithAgentPolicy,
    type CodeSmithContext,
    type ExecutionConfig
} from './types';
import { CodeSmithWorkspaceManager } from './workspace-manager';
import { normalizeCodeSmithMode as resolveCodeSmithMode } from './mode-policy';
import { StrategyFactory } from './strategies/StrategyFactory';
import { CodeSmithWorkspaceService } from './codesmith-workspace.service';

interface ClarificationContext {
    execution_id: string;
    workspace_id: string;
    user_id: string;
    mode?: string;
    query?: string;
    architect_notes?: string;
    planning_notes?: string;
    ambiguity_score?: number;
    ambiguity_reasons?: string[];
}

const clarificationPayloadSchema = z.object({
    clarification: z.string().trim().min(1)
}).passthrough();

function inferAgentKey(agentConfig: IAgentConfig): CodeSmithAgentKey | null {
    return inferCatalogAgentKey(agentConfig);
}

function inferRole(agentConfig: IAgentConfig, agentKey: CodeSmithAgentKey | null): CodeSmithRole {
    return inferCatalogRole(agentConfig, agentKey);
}

export class CodeSmithDispatcherService {
    public static async executeAgentTask(
        execution_id: string,
        agentConfig: IAgentConfig,
        config: {
            workspace_id: string;
            user_id: string;
            mode: string;
            query: string;
            workspace_root?: string;
        }
    ): Promise<{ summary: string; duration_ms: number }> {
        const normalizedConfig = this.normalizeExecutionConfig(execution_id, config);
        return Tracing.withSpan(
            'codesmith.execute_agent_task',
            {
                execution_id,
                workspace_id: normalizedConfig.workspace_id,
                user_id: normalizedConfig.user_id,
                agent_id: String(agentConfig.agent_id || ''),
                mode: normalizedConfig.mode
            },
            async () => {
                const started = Date.now();
                const ctx = await CodeSmithWorkspaceService.hydrateExecutionContext(execution_id);
                const agentKey = inferAgentKey(agentConfig);
                const role = inferRole(agentConfig, agentKey);
                const policy = agentKey
                    ? AdminConfigService.resolveCodeSmithAgentPolicy({
                        agentKey,
                        mode: normalizedConfig.mode,
                        workspace_id: normalizedConfig.workspace_id,
                        user_id: normalizedConfig.user_id
                    })
                    : null;

                if (!AdminConfig.getOpenRouterApiKey(false)) {
                    throw new Error('OPENROUTER_API_KEY must be configured for CodeSmith real execution');
                }

                if (policy && !policy.enabled) {
                    throw new Error(`CodeSmith agent '${policy.agentId}' is disabled by admin policy`);
                }

                const strategy = StrategyFactory.get(role);
                return strategy.execute(ctx, agentConfig, normalizedConfig, started, policy, agentKey);
            }
        );
    }

    public static async requestClarification(
        fromAgent: string,
        toAgent: string,
        question: string,
        context?: ClarificationContext
    ): Promise<{ clarification: string; model: string; question: string }> {
        const normalizedQuestion = String(question || '').trim();
        if (!normalizedQuestion) {
            throw new Error('Clarification request requires a non-empty question');
        }

        if (!context) {
            return {
                clarification: 'Clarification context unavailable. Continue with conservative defaults and document assumptions.',
                model: 'none',
                question: normalizedQuestion
            };
        }

        await eventStore.appendEvent({
            execution_id: context.execution_id,
            workspace_id: context.workspace_id,
            user_id: context.user_id,
            agent_id: `codesmith:${fromAgent}`,
            event_type: EventType.ACTION_TIMELINE,
            payload: {
                type: 'clarification_request',
                from: fromAgent,
                to: toAgent,
                question: normalizedQuestion,
                ambiguity_score: typeof context.ambiguity_score === 'number' ? context.ambiguity_score : null,
                ambiguity_reasons: context.ambiguity_reasons || [],
                execution_id: context.execution_id,
                execution_trace_id: context.execution_id
            }
        });

        let preferredModel = RuntimeEnv.getOrDefault('CODESMITH_CLARIFICATION_MODEL', '');
        let maxTokens = RuntimeEnv.getNumber('CODESMITH_CLARIFICATION_MAX_TOKENS', 1200);
        try {
            const architectPolicy = AdminConfigService.resolveCodeSmithAgentPolicy({
                agentKey: 'system_architect',
                workspace_id: context.workspace_id,
                user_id: context.user_id
            });
            preferredModel = preferredModel || architectPolicy.model;
            maxTokens = Math.min(Math.max(maxTokens, 400), architectPolicy.maxTokens);
        } catch (error) {
            logger.warn('CodeSmith clarification policy fallback', {
                execution_id: context.execution_id,
                error: error instanceof Error ? error.message : String(error)
            });
        }

        const prompt = [
            'You are the architecture clarification agent in CodeSmith.',
            `Original request: ${context.query || '(unknown)'}`,
            '',
            '[Current planning notes]',
            context.planning_notes || context.architect_notes || '(none)',
            '',
            '[Builder clarification question]',
            normalizedQuestion,
            '',
            'Respond with a concise clarification block that unblocks implementation.',
            'Include concrete choices for auth provider, data schema, API contracts, and integration behavior when applicable.',
            'If information is genuinely missing, state assumptions explicitly and keep them minimal.'
        ].join('\n');

        const result = await ModelResolver.callModel({
            execution_id: context.execution_id,
            workspace_id: context.workspace_id,
            user_id: context.user_id,
            agent_id: `codesmith:${toAgent}:clarifier`,
            execution_type: resolveCodeSmithMode(context.mode),
            prompt,
            preferred_model: preferredModel || undefined,
            max_tokens: maxTokens,
            cost_multiplier: 1,
            system_prompt: 'You produce implementation-ready architectural clarifications.',
            require_real_model: true,
            model_config: {
                temperature: 0.1
            }
        });

        const clarification = this.extractClarificationText(result.response);
        await eventStore.appendEvent({
            execution_id: context.execution_id,
            workspace_id: context.workspace_id,
            user_id: context.user_id,
            agent_id: `codesmith:${toAgent}:clarifier`,
            event_type: EventType.ACTION_TIMELINE,
            payload: {
                type: 'clarification_response',
                from: toAgent,
                to: fromAgent,
                question: normalizedQuestion,
                clarification,
                model: result.model_used,
                execution_id: context.execution_id,
                execution_trace_id: context.execution_id
            }
        });

        return {
            clarification,
            model: result.model_used,
            question: normalizedQuestion
        };
    }

    private static normalizeExecutionConfig(
        execution_id: string,
        config: {
            workspace_id: string;
            user_id: string;
            mode: string;
            query: string;
            workspace_root?: string;
        }
    ): ExecutionConfig {
        const normalizedMode = resolveCodeSmithMode(config.mode);
        const fallbackWorkspaceRoot = CodeSmithWorkspaceManager.getExecutionPaths(
            config.workspace_id,
            execution_id
        ).root;
        return {
            execution_id,
            workspace_id: config.workspace_id,
            user_id: config.user_id,
            mode: normalizedMode,
            query: config.query,
            workspace_root: config.workspace_root || fallbackWorkspaceRoot
        };
    }

    private static extractClarificationText(raw: string): string {
        const value = String(raw || '').trim();
        if (!value) {
            return 'No clarification content returned. Continue with minimal assumptions and document any risk.';
        }

        try {
            const parsed = clarificationPayloadSchema.safeParse(JSON.parse(value) as unknown);
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
}
