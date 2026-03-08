import { Tracing } from '../../shims/tracing';
import type { IAgentConfig } from '../../shims/db-models';

import type { CodeSmithContext, ExecutionConfig, CodeSmithAgentPolicy, CodeSmithAgentKey } from '../types';
import { CodeSmithRuntimeUtils } from '../utils/CodeSmithRuntimeUtils';
import { WorkspaceTools } from '../workspace-tools';
import { CodeArtifactParser } from '../code-artifact-parser';
import type { AgentStrategy } from './AgentStrategy';

interface ArchitectureAmbiguityAssessment {
  score: number;
  reasons: string[];
}

const AMBIGUITY_THRESHOLD = 0.55;

export class BuilderStrategy implements AgentStrategy {
  async execute(
    ctx: CodeSmithContext,
    agentConfig: IAgentConfig,
    config: ExecutionConfig,
    started: number,
    policy: CodeSmithAgentPolicy | null,
    agentKey: CodeSmithAgentKey | null
  ): Promise<{ summary: string; duration_ms: number }> {
    return Tracing.withSpan(
      'codesmith.builder.execute',
      {
        execution_id: ctx.execution_id,
        workspace_id: ctx.workspace_id,
        user_id: ctx.user_id,
        agent_id: String(agentConfig.agent_id || ''),
      },
      async () => {
        CodeSmithRuntimeUtils.assertToolAllowed(policy, 'list_dir', agentConfig.agent_id);
        CodeSmithRuntimeUtils.assertToolAllowed(policy, 'write_file', agentConfig.agent_id);
        const tree = await CodeSmithRuntimeUtils.safeTree(ctx, policy, agentConfig.agent_id);
        const recentNotes = CodeSmithRuntimeUtils.collectNotes(ctx, [
          'product_strategist',
          'system_architect',
          'technical_planner',
          'ui_designer',
          'design_system',
          'frontend_engineer',
          'backend_engineer',
          'database_architect',
          'api_integrations',
          'devops_engineer',
          'technical_writer',
          'growth_agent'
        ]);
        let planningNotes = recentNotes || ctx.architect_notes || '(none)';

        const ambiguity = this.assessArchitectureAmbiguity(planningNotes);
        if (ambiguity.score >= AMBIGUITY_THRESHOLD) {
          const question = this.buildClarificationQuestion(config.query, ambiguity.reasons);
          const { CodeSmithExecutionService } = await import('../codesmith-execution.service');
          const clarification = await CodeSmithExecutionService.requestClarification(
            'builder',
            'architect',
            question,
            {
              execution_id: ctx.execution_id,
              workspace_id: ctx.workspace_id,
              user_id: ctx.user_id,
              mode: config.mode,
              query: config.query,
              architect_notes: ctx.architect_notes,
              planning_notes: planningNotes,
              ambiguity_score: ambiguity.score,
              ambiguity_reasons: ambiguity.reasons
            }
          );

          if (clarification?.clarification) {
            const block = `[Architect Clarification]\n${clarification.clarification}`;
            planningNotes = [planningNotes, block].filter(Boolean).join('\n\n');
            ctx.architect_notes = [ctx.architect_notes, block].filter(Boolean).join('\n\n');
            ctx.planning_notes = [ctx.planning_notes, block].filter(Boolean).join('\n\n');
            ctx.specialist_notes.system_architect = [
              ctx.specialist_notes.system_architect || '',
              block
            ].filter(Boolean).join('\n\n');
          }
        }

        const prompt = [
          `You are ${agentConfig.name || 'CodeSmith implementation agent'}.`,
          `Agent key: ${agentKey || 'unknown'}`,
          `Responsibility: ${agentConfig.description || agentConfig.role || 'Implementation and delivery'}.`,
          `Build request: ${config.query}`,
          'Planning and specialist notes:',
          planningNotes,
          'Recent failure logs:',
          ctx.latest_failure || '(none)',
          'Current workspace tree:',
          tree || '(empty)',
          'Return executable project artifacts only, using ONE of the following formats:',
          '1) JSON: {"artifacts":[{"path":"src/file.ts","language":"ts","content":"..."}]}',
          '2) fenced code blocks with path hints: ```ts path=src/file.ts',
          '3) unified diff blocks (preferred for editing existing files): ```diff',
          'When using JSON with unified diffs, set "update_mode":"unified_diff" and put the patch in "content".',
          'Prefer unified diffs for existing files; use full file artifacts for new files.',
          'Every artifact must include a relative file path.'
        ].join('\n');

        const result = await CodeSmithRuntimeUtils.callModel(ctx, agentConfig, config, prompt, policy);
        await CodeSmithRuntimeUtils.streamText(ctx, agentConfig.agent_id, result.response);

        const artifacts = CodeArtifactParser.parse(result.response, agentConfig.agent_id);
        if (artifacts.length === 0) {
          throw new Error(`No code artifacts returned by ${agentConfig.agent_id}`);
        }
        const writeResults: Array<{ path: string; version: number }> = [];
        for (const artifact of artifacts) {
          const written = await WorkspaceTools.writeFile({
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
          writeResults.push({ path: written.path, version: written.version });
        }

        ctx.latest_diff_summary = writeResults
          .map((item) => `${item.path}@v${item.version}`)
          .join(', ');
        if (agentKey) {
          ctx.specialist_notes[agentKey] = `Wrote ${writeResults.length} artifact(s): ${ctx.latest_diff_summary}`;
        }

        return {
          summary: `${agentConfig.agent_id} wrote ${writeResults.length} files`,
          duration_ms: Date.now() - started
        };
      }
    );
  }

  private assessArchitectureAmbiguity(notes: string): ArchitectureAmbiguityAssessment {
    const value = String(notes || '').trim();
    if (!value || value === '(none)') {
      return {
        score: 1,
        reasons: ['No architecture notes are available for implementation handoff.']
      };
    }

    const reasons: string[] = [];
    let score = 0;
    const normalized = value.toLowerCase();

    const mentionsAuth = /(oauth|authentication|auth provider|sso)/i.test(normalized);
    const namesProvider = /(google|github|auth0|okta|microsoft|azure|apple|gitlab|discord|cognito)/i.test(normalized);
    if (mentionsAuth && !namesProvider) {
      score += 0.35;
      reasons.push('Authentication is mentioned without a concrete provider.');
    }

    const mentionsDatabase = /(database|schema|model|persistence|storage)/i.test(normalized);
    const hasSchemaDetail = /(table|column|fields?|primary key|foreign key|prisma|typeorm|mongoose|migration)/i.test(normalized);
    if (mentionsDatabase && !hasSchemaDetail) {
      score += 0.3;
      reasons.push('Database requirements are present but schema details are missing.');
    }

    const mentionsApi = /(api|endpoint|route|integration)/i.test(normalized);
    const hasApiDetail = /(get\s+\/|post\s+\/|put\s+\/|delete\s+\/|\/api\/|request\/response|payload)/i.test(normalized);
    if (mentionsApi && !hasApiDetail) {
      score += 0.25;
      reasons.push('API and integration direction is not specific enough for implementation.');
    }

    if (/(tbd|todo|later|as needed|etc\.)/i.test(normalized)) {
      score += 0.2;
      reasons.push('Planning notes include placeholders that block deterministic implementation.');
    }

    if (value.length < 280) {
      score += 0.15;
      reasons.push('Planning notes are too short for a reliable builder handoff.');
    }

    return {
      score: Math.max(0, Math.min(1, score)),
      reasons
    };
  }

  private buildClarificationQuestion(query: string, reasons: string[]): string {
    const topReasons = reasons.slice(0, 3).join(' ');
    return [
      `Implementation request: ${query}`,
      'The builder detected architecture ambiguity that blocks deterministic implementation.',
      topReasons || 'Architecture details are currently underspecified.',
      'Provide precise implementation-level clarifications for auth provider, API contracts, data schema, and external integrations.'
    ].join(' ');
  }
}
