/**
 * AdminConfigService shim — replaces @core/control-plane/admin-config.service.
 * Resolves per-agent policies from config/settings.json.
 */
import { AdminConfig } from './admin-config';
import type { CodeSmithAgentPolicy, CodeSmithTool } from '../codesmith/types';

interface ResolveParams {
    agentKey: string;
    mode?: string;
    workspace_id?: string;
    user_id?: string;
}

export class AdminConfigService {
    /**
     * Resolve the full policy for a CodeSmith agent given its key and optional mode.
     */
    static resolveCodeSmithAgentPolicy(params: ResolveParams): CodeSmithAgentPolicy {
        const { agentKey, mode } = params;

        // Base model from codesmith_agent_models
        const agentModels = AdminConfig.getCodeSmithAgentModels();
        let model = agentModels[agentKey] || 'openai/gpt-4.1';

        // Mode override from mode_agent_model_bindings
        if (mode) {
            const modeBindings = AdminConfig.getModeAgentModelBindings();
            const modeMap = modeBindings[mode];
            if (modeMap && modeMap[agentKey]) {
                model = modeMap[agentKey];
            }
        }

        // Token cap
        const tokenCaps = AdminConfig.getCodeSmithAgentTokenCaps();
        let maxTokens = tokenCaps[agentKey] || 4000;

        // Mode token override
        if (mode) {
            const modeTokenLimits = AdminConfig.getModeAgentTokenLimits();
            const modeTokenMap = modeTokenLimits[mode];
            if (modeTokenMap && modeTokenMap[agentKey] !== undefined) {
                maxTokens = modeTokenMap[agentKey];
            }
        }

        // Credit multiplier
        const multipliers = AdminConfig.getCodeSmithAgentCreditMultipliers();
        const creditMultiplier = multipliers[agentKey] || 1;

        // Enabled
        const enabledFlags = AdminConfig.getCodeSmithAgentEnabled();
        const enabled = enabledFlags[agentKey] !== false;

        // Allowed tools
        const allTools = AdminConfig.getCodeSmithAgentAllowedTools();
        const allowedTools = (allTools[agentKey] || ['list_dir', 'read_file']) as CodeSmithTool[];

        return {
            agentKey: agentKey as CodeSmithAgentPolicy['agentKey'],
            agentId: `codesmith:${agentKey}`,
            model,
            maxTokens,
            creditMultiplier,
            enabled,
            allowedTools,
        };
    }

    /**
     * Check if a tool is allowed by policy
     */
    static isCodeSmithToolAllowed(policy: CodeSmithAgentPolicy, tool: CodeSmithTool): boolean {
        return policy.allowedTools.includes(tool);
    }
}
