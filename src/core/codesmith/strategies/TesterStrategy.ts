import { promises as fs } from 'fs';
import { Tracing } from '../../shims/tracing';
import type { IAgentConfig } from '../../shims/db-models';
import type { CodeSmithContext, ExecutionConfig, CodeSmithAgentPolicy, CodeSmithAgentKey } from '../types';
import { CodeSmithRuntimeUtils } from '../utils/CodeSmithRuntimeUtils';
import type { AgentStrategy } from './AgentStrategy';
import { WorkspaceTools } from '../workspace-tools';
import { CodeArtifactParser } from '../code-artifact-parser';
import { TerminalRunner } from '../terminal-runner';
import { CodeSmithWorkspaceManager } from '../workspace-manager';

type QualityCheckType = 'install' | 'static_analysis' | 'unit_tests' | 'integration_tests' | 'build';

interface QualityCheckResult {
    type: QualityCheckType;
    command: string;
    passed: boolean;
    exit_code: number | null;
    timed_out: boolean;
    stderr_tail: string;
}

interface StructuredTestReport {
    agent_id: string;
    cycle: number;
    passed: boolean;
    checks: QualityCheckResult[];
}

export class TesterStrategy implements AgentStrategy {
    async execute(
        ctx: CodeSmithContext,
        agentConfig: IAgentConfig,
        config: ExecutionConfig,
        started: number,
        policy: CodeSmithAgentPolicy | null,
        agentKey: CodeSmithAgentKey | null
    ): Promise<{ summary: string; duration_ms: number }> {
        return Tracing.withSpan(
            'codesmith.tester.execute',
            {
                execution_id: ctx.execution_id,
                workspace_id: ctx.workspace_id,
                user_id: ctx.user_id,
                agent_id: String(agentConfig.agent_id || '')
            },
            async () => {
                CodeSmithRuntimeUtils.assertToolAllowed(policy, 'run_command', agentConfig.agent_id);
                CodeSmithRuntimeUtils.assertToolAllowed(policy, 'read_file', agentConfig.agent_id);

                if ((agentConfig.capabilities as string[] | undefined)?.includes('test_writing')) {
                    await this.generateTests(ctx, agentConfig, config, policy, agentKey);
                }

                const report = await this.runQualityGate(ctx, agentConfig, config);
                const reportText = JSON.stringify(report, null, 2);
                if (agentKey) {
                    ctx.specialist_notes[agentKey] = reportText;
                }

                if (!report.passed) {
                    ctx.latest_failure = `Test gate failed:\n${reportText}`;
                    throw new Error(`Tester quality gate failed: ${report.checks.find((check) => !check.passed)?.type || 'unknown'}`);
                }

                ctx.latest_failure = '';
                return {
                    summary: `tester_passed:${report.checks.length}`,
                    duration_ms: Date.now() - started
                };
            }
        );
    }

    private async generateTests(
        ctx: CodeSmithContext,
        agentConfig: IAgentConfig,
        config: ExecutionConfig,
        policy: CodeSmithAgentPolicy | null,
        agentKey: CodeSmithAgentKey | null
    ): Promise<void> {
        CodeSmithRuntimeUtils.assertToolAllowed(policy, 'write_file', agentConfig.agent_id);
        const tree = await CodeSmithRuntimeUtils.safeTree(ctx, policy, agentConfig.agent_id);
        const notes = CodeSmithRuntimeUtils.collectNotes(ctx, [
            'product_strategist',
            'technical_planner',
            'backend_engineer',
            'frontend_engineer'
        ]);

        const prompt = [
            `You are ${agentConfig.name || 'QA Engineer'}.`,
            'Generate or improve tests for unit and integration coverage.',
            `Objective: ${config.query}`,
            'Context:',
            notes || '(none)',
            'Workspace tree:',
            tree || '(empty)',
            'Recent diff summary:',
            ctx.latest_diff_summary || '(none)',
            'Return artifacts as JSON {"artifacts":[...]} or fenced code blocks with file paths.',
            'Prefer unified diff blocks for edits to existing files.'
        ].join('\n');

        const result = await CodeSmithRuntimeUtils.callModel(ctx, agentConfig, config, prompt, policy);
        await CodeSmithRuntimeUtils.streamText(ctx, agentConfig.agent_id, result.response);
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

        if (agentKey && artifacts.length > 0) {
            const previous = ctx.specialist_notes[agentKey] || '';
            ctx.specialist_notes[agentKey] = [previous, `Generated ${artifacts.length} test artifact(s)`]
                .filter(Boolean)
                .join('\n');
        }
    }

    private async runQualityGate(
        ctx: CodeSmithContext,
        agentConfig: IAgentConfig,
        config: ExecutionConfig
    ): Promise<StructuredTestReport> {
        const packageJsonPath = CodeSmithWorkspaceManager.resolveWithinWorkspace(ctx.workspace_root, 'package.json');
        const packageJsonRaw = await fs.readFile(packageJsonPath, 'utf8');
        const packageJson = JSON.parse(packageJsonRaw) as { scripts?: Record<string, string> };
        const scripts = packageJson.scripts || {};

        const checks: Array<{ type: QualityCheckType; command: string }> = [
            { type: 'install', command: 'npm install' }
        ];
        if (scripts.lint) checks.push({ type: 'static_analysis', command: 'npm run lint' });
        if (scripts['test:unit']) {
            checks.push({ type: 'unit_tests', command: 'npm run test:unit' });
        } else if (scripts.test) {
            checks.push({ type: 'unit_tests', command: 'npm test' });
        }
        if (scripts['test:integration']) checks.push({ type: 'integration_tests', command: 'npm run test:integration' });
        if (scripts.build) checks.push({ type: 'build', command: 'npm run build' });

        const results: QualityCheckResult[] = [];
        for (const check of checks) {
            const run = await TerminalRunner.runCommand({
                execution_id: ctx.execution_id,
                workspace_id: ctx.workspace_id,
                user_id: ctx.user_id,
                agent_id: agentConfig.agent_id,
                workspace_root: ctx.workspace_root,
                command: check.command
            });
            const passed = run.timed_out !== true && run.exit_code === 0;
            results.push({
                type: check.type,
                command: check.command,
                passed,
                exit_code: run.exit_code,
                timed_out: run.timed_out,
                stderr_tail: CodeSmithRuntimeUtils.trimLog(run.stderr || run.stdout || '', 3000)
            });
            if (!passed) {
                break;
            }
        }

        return {
            agent_id: agentConfig.agent_id,
            cycle: config.cycle || 1,
            passed: results.every((item) => item.passed),
            checks: results
        };
    }
}
