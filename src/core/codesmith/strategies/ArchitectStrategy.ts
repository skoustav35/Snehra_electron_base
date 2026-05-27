import { Tracing } from '../../shims/tracing';
import type { IAgentConfig } from '../../shims/db-models';
import type { CodeSmithContext, ExecutionConfig, CodeSmithAgentPolicy, CodeSmithAgentKey } from '../types';
import { CodeSmithRuntimeUtils } from '../utils/CodeSmithRuntimeUtils';
import type { AgentStrategy } from './AgentStrategy';

export class ArchitectStrategy implements AgentStrategy {
  async execute(
    ctx: CodeSmithContext,
    agentConfig: IAgentConfig,
    config: ExecutionConfig,
    started: number,
    policy: CodeSmithAgentPolicy | null,
    agentKey: CodeSmithAgentKey | null
  ): Promise<{ summary: string; duration_ms: number }> {
    return Tracing.withSpan(
      'codesmith.architect.execute',
      {
        execution_id: ctx.execution_id,
        workspace_id: ctx.workspace_id,
        user_id: ctx.user_id,
        agent_id: String(agentConfig.agent_id || ''),
      },
      async () => {
        CodeSmithRuntimeUtils.assertToolAllowed(policy, 'list_dir', agentConfig.agent_id);
        const tree = await CodeSmithRuntimeUtils.safeTree(ctx, policy, agentConfig.agent_id);
        const priorNotes = CodeSmithRuntimeUtils.collectNotes(ctx, [
          'product_strategist',
          'system_architect',
          'technical_planner',
          'ux_researcher',
          'ui_designer',
          'design_system'
        ]);

        const prompt = [
          `You are ${agentConfig.name || 'CodeSmith planning agent'}.`,
          `Agent key: ${agentKey || 'unknown'}`,
          `Responsibility: ${agentConfig.description || agentConfig.role || 'Planning and architecture'}.`,
          `Task: ${config.query}`,
          'Produce concise planning output with sections:',
          '1) Objective',
          '2) Scope and assumptions',
          '3) Architecture or UX decision points',
          '4) Task breakdown',
          '5) Risk list',
          'Use precise engineering language.',
          'Prior planning notes:',
          priorNotes || '(none)',
          'Current workspace tree:',
          tree || '(empty)'
        ].join('\n');

        const result = await CodeSmithRuntimeUtils.callModel(ctx, agentConfig, config, prompt, policy);
        await CodeSmithRuntimeUtils.streamText(ctx, agentConfig.agent_id, result.response);
        ctx.architect_notes = [ctx.architect_notes, result.response].filter(Boolean).join('\n\n');
        ctx.planning_notes = [ctx.planning_notes, result.response].filter(Boolean).join('\n\n');
        if (agentKey) {
          ctx.specialist_notes[agentKey] = result.response;
        }
        return {
          summary: result.response.slice(0, 160),
          duration_ms: Date.now() - started
        };
      }
    );
  }
}
