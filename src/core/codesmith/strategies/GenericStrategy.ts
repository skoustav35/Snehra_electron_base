import { Tracing } from '../../shims/tracing';
import type { IAgentConfig } from '../../shims/db-models';
import type { CodeSmithContext, ExecutionConfig, CodeSmithAgentPolicy, CodeSmithAgentKey } from '../types';
import { CodeSmithRuntimeUtils } from '../utils/CodeSmithRuntimeUtils';
import type { AgentStrategy } from './AgentStrategy';

export class GenericStrategy implements AgentStrategy {
  async execute(
    ctx: CodeSmithContext,
    agentConfig: IAgentConfig,
    config: ExecutionConfig,
    started: number,
    policy: CodeSmithAgentPolicy | null,
    agentKey: CodeSmithAgentKey | null
  ): Promise<{ summary: string; duration_ms: number }> {
    return Tracing.withSpan(
      'codesmith.generic.execute',
      {
        execution_id: ctx.execution_id,
        workspace_id: ctx.workspace_id,
        user_id: ctx.user_id,
        agent_id: String(agentConfig.agent_id || ''),
      },
      async () => {
        const prompt = [
          `Agent: ${agentConfig.name} (${agentConfig.type})`,
          `Agent key: ${agentKey || 'n/a'}`,
          `Responsibility: ${agentConfig.description || agentConfig.role || 'General assistance'}`,
          `Task: ${config.query}`,
          `Workspace: ${config.workspace_id}`
        ].join('\n');
        const result = await CodeSmithRuntimeUtils.callModel(ctx, agentConfig, config, prompt, policy);
        await CodeSmithRuntimeUtils.streamText(ctx, agentConfig.agent_id, result.response);
        if (agentKey) {
          ctx.specialist_notes[agentKey] = result.response;
        }
        return {
          summary: result.response.slice(0, 140),
          duration_ms: Date.now() - started
        };
      }
    );
  }
}
