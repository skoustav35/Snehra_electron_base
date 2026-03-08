import { Tracing } from '../../shims/tracing';
import type { IAgentConfig } from '../../shims/db-models';
import type { CodeSmithContext, ExecutionConfig, CodeSmithAgentPolicy, CodeSmithAgentKey } from '../types';
import { CodeSmithRuntimeUtils } from '../utils/CodeSmithRuntimeUtils';
import type { AgentStrategy } from './AgentStrategy';


export class ReviewerStrategy implements AgentStrategy {
  async execute(
    ctx: CodeSmithContext,
    agentConfig: IAgentConfig,
    config: ExecutionConfig,
    started: number,
    policy: CodeSmithAgentPolicy | null,
    agentKey: CodeSmithAgentKey | null
  ): Promise<{ summary: string; duration_ms: number }> {
    return Tracing.withSpan(
      'codesmith.reviewer.execute',
      {
        execution_id: ctx.execution_id,
        workspace_id: ctx.workspace_id,
        user_id: ctx.user_id,
        agent_id: String(agentConfig.agent_id || ''),
      },
      async () => {
        CodeSmithRuntimeUtils.assertToolAllowed(policy, 'list_dir', agentConfig.agent_id);
        const tree = await CodeSmithRuntimeUtils.safeTree(ctx, policy, agentConfig.agent_id);
        const evidenceNotes = CodeSmithRuntimeUtils.collectNotes(ctx, [
          'product_strategist',
          'system_architect',
          'technical_planner',
          'frontend_engineer',
          'backend_engineer',
          'database_architect',
          'api_integrations',
          'tester',
          'debugger',
          'qa_engineer',
          'performance_engineer',
          'devops_engineer'
        ]);

        const prompt = [
          `You are ${agentConfig.name || 'CodeSmith reviewer'}.`,
          `Agent key: ${agentKey || 'unknown'}`,
          `Execution objective: ${config.query}`,
          `Review objective: ${agentConfig.description || 'Validate release quality and risk'}.`,
          'Provide a concise review focused on correctness, security, performance, deployment-readiness, and residual risks.',
          'Specialist evidence notes:',
          evidenceNotes || '(none)',
          'Recent diff summary:',
          ctx.latest_diff_summary || '(none)',
          'Recent command logs:',
          CodeSmithRuntimeUtils.trimLog(ctx.latest_command_log, 4000) || '(none)',
          'Current tree:',
          tree || '(empty)'
        ].join('\n');

        const result = await CodeSmithRuntimeUtils.callModel(ctx, agentConfig, config, prompt, policy);
        await CodeSmithRuntimeUtils.streamText(ctx, agentConfig.agent_id, result.response);
        if (agentKey) {
          ctx.specialist_notes[agentKey] = result.response;
        }
        return {
          summary: result.response.slice(0, 200),
          duration_ms: Date.now() - started
        };
      }
    );
  }
}
