/**
 * ModelResolver shim — replaces @core/execution-plane/model-resolver.
 * Routes LLM calls through OpenRouter using the user's OPENROUTER_API_KEY.
 * Uses the Vercel AI SDK's generateText for non-streaming agent calls.
 */
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { AdminConfig } from './admin-config';
import { RuntimeEnv } from './runtime-env';

interface CallModelParams {
    execution_id: string;
    workspace_id: string;
    user_id: string;
    agent_id: string;
    prompt: string;
    execution_type?: string;
    preferred_model?: string;
    max_tokens?: number;
    cost_multiplier?: number;
    system_prompt?: string;
    require_real_model?: boolean;
    model_config?: {
        temperature?: number;
        [key: string]: unknown;
    };
}

interface CallModelResult {
    response: string;
    model_used: string;
    tokens_used?: number;
}

export class ModelResolver {
    static async callModel(params: CallModelParams): Promise<CallModelResult> {
        const apiKey = AdminConfig.getOpenRouterApiKey(true);
        const baseURL = AdminConfig.getOpenRouterBaseUrl();
        // Dynamic agent-model resolution from config/settings.json
        const agentModels = AdminConfig.getCodeSmithAgentModels();
        const extractedAgentKey = params.agent_id.replace(/^codesmith:/, '');
        const baseAgentRole = extractedAgentKey.split(':')[0];
        const modelName = params.preferred_model || agentModels[baseAgentRole] || 'openai/gpt-4.1';
        const maxTokens = params.max_tokens || 4000;
        const maxRetries = Math.max(1, RuntimeEnv.getNumber('CODESMITH_OPENROUTER_MAX_RETRIES', 3));
        const baseRetryDelayMs = Math.max(100, RuntimeEnv.getNumber('CODESMITH_OPENROUTER_RETRY_DELAY_MS', 1200));
        const maxRetryDelayMs = Math.max(baseRetryDelayMs, RuntimeEnv.getNumber('CODESMITH_OPENROUTER_RETRY_MAX_DELAY_MS', 8000));

        const openrouter = createOpenAI({
            baseURL,
            apiKey,
        });

        let attempt = 0;
        while (attempt < maxRetries) {
            try {
                const result = await generateText({
                    model: openrouter(modelName),
                    system: params.system_prompt || undefined,
                    prompt: params.prompt,
                    maxTokens,
                    temperature: params.model_config?.temperature ?? 0.2,
                });

                return {
                    response: result.text,
                    model_used: modelName,
                    tokens_used: result.usage?.totalTokens || 0,
                };
            } catch (error) {
                attempt += 1;
                const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
                const status = Number((error as { status?: unknown; statusCode?: unknown } | null)?.status
                    || (error as { status?: unknown; statusCode?: unknown } | null)?.statusCode
                    || 0);
                const isOverloaded = status === 529
                    || errorMessage.includes(' 529')
                    || errorMessage.includes('status 529')
                    || errorMessage.includes('overload')
                    || errorMessage.includes('temporarily unavailable');

                if (!isOverloaded || attempt >= maxRetries) {
                    throw error;
                }

                const delayMs = Math.min(maxRetryDelayMs, baseRetryDelayMs * 2 ** (attempt - 1));
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }

        throw new Error(`OpenRouter call failed after ${maxRetries} attempt(s)`);
    }
}
