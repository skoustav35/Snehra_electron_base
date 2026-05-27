import { AdminConfigService } from '../../shims/admin-config-service';
import { eventStore } from '../../shims/event-store';
import { EventType } from '../../shims/events';
import { logger } from '../../shims/logger';
import { RuntimeEnv } from '../../shims/runtime-env';
import { AdminConfig } from '../../shims/admin-config';
import { artifactScanner } from '../../shims/artifact-scanner';
import { CodeSmithWorkspaceManager } from '../workspace-manager';
import { WorkspaceTools } from '../workspace-tools';
import { TerminalRunner } from '../terminal-runner';
import { BuildArtifactService } from '../build-artifact.service';
import { CodeArtifactParser } from '../code-artifact-parser';
import { prunePromptToWindow, resolvePromptTokenBudget } from '../context-window';
import { pluginManager } from '../../shims/plugin-manager';
import type { IAgentConfig } from '../../shims/db-models';

import type { ExecutionConfig, CodeSmithContext, CodeSmithAgentPolicy, CodeSmithAgentKey, CodeSmithTool } from '../types';

export class CodeSmithRuntimeUtils {
  public static async callModel(
    ctx: CodeSmithContext,
    agentConfig: IAgentConfig,
    config: ExecutionConfig,
    prompt: string,
    policy: CodeSmithAgentPolicy | null
  ): Promise<{ response: string }> {
    const { ModelResolver } = await import('../../shims/model-resolver');
    const maxPromptTokens = resolvePromptTokenBudget(RuntimeEnv.getNumber('CODESMITH_MAX_PROMPT_TOKENS', 8000));
    const compression = artifactScanner.compressWorkspaceContext({
      workspace_id: ctx.workspace_id,
      query: config.query,
      max_tokens: Math.max(300, Math.floor(maxPromptTokens * 0.2)),
      max_chunks: 24
    });
    const promptWithIndexedContext = compression.summary
      ? `${prompt}\n\n[Indexed workspace context]\n${compression.summary}`
      : prompt;
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
      logger.warn('CodeSmith rolling context window trimmed prompt', {
        execution_id: ctx.execution_id,
        workspace_id: ctx.workspace_id,
        agent_id: agentConfig.agent_id,
        trimmed_tokens: promptWindow.trimmed_tokens,
        estimated_tokens: promptWindow.estimated_tokens,
        indexed_chunks: compression.included_chunks,
        indexed_tokens: compression.token_estimate
      });

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
          max_prompt_tokens: maxPromptTokens,
          indexed_chunks: compression.included_chunks,
          indexed_tokens: compression.token_estimate
        }
      });
    }

    // Construct the request for ModelResolver
    const result = await ModelResolver.callModel({
      execution_id: ctx.execution_id,
      workspace_id: ctx.workspace_id,
      user_id: ctx.user_id,
      agent_id: agentConfig.agent_id,
      prompt: promptWindow.prompt,
      execution_type: config.mode,
      preferred_model: policy?.model,
      max_tokens: agentConfig.model_config?.max_tokens || policy?.maxTokens || 4000,
      cost_multiplier: policy?.creditMultiplier || 1,
      system_prompt: `You are ${agentConfig.name}, an expert software engineer.`,
      model_config: {
        temperature: 0.2
      }
    });

    return {
      response: result.response
    };
  }

  public static async safeTree(
    ctx: CodeSmithContext,
    policy: CodeSmithAgentPolicy | null,
    agentId: string
  ): Promise<string> {
    this.assertToolAllowed(policy, 'list_dir', agentId);

    try {
      const tree = await CodeSmithWorkspaceManager.listTree(ctx.workspace_root);
      return tree.join('\n');
    } catch (error) {
      logger.error('Failed to list workspace tree', {
        execution_id: ctx.execution_id,
        agent_id: agentId,
        error: error instanceof Error ? error.message : String(error)
      });
      return '(failed to read workspace)';
    }
  }

  public static assertToolAllowed(
    policy: CodeSmithAgentPolicy | null,
    toolName: CodeSmithTool,
    agentId: string
  ): void {
    if (!policy) return;

    const allowed = policy.allowedTools?.includes(toolName);
    if (!allowed) {
      throw new Error(`Tool '${toolName}' not allowed for agent '${agentId}' by policy`);
    }
  }

  public static async streamText(
    ctx: CodeSmithContext,
    agentId: string,
    chunk: string
  ): Promise<void> {
    await eventStore.appendEvent({
      execution_id: ctx.execution_id,
      workspace_id: ctx.workspace_id,
      user_id: ctx.user_id,
      agent_id: agentId,
      event_type: EventType.STREAM_TEXT,
      payload: { chunk }
    });
  }

  public static collectNotes(
    ctx: CodeSmithContext,
    agentKeys: CodeSmithAgentKey[]
  ): string {
    const notes: string[] = [];
    for (const key of agentKeys) {
      const note = ctx.specialist_notes[key];
      if (note) {
        notes.push(`[${key}]: ${note}`);
      }
    }
    return notes.join('\n\n');
  }

  public static detectPackageManager(packageManager?: string): 'npm' | 'yarn' | 'pnpm' {
    if (packageManager?.includes('yarn')) return 'yarn';
    if (packageManager?.includes('pnpm')) return 'pnpm';
    return 'npm';
  }

  public static pmCommand(pm: 'npm' | 'yarn' | 'pnpm', script: string): string {
    switch (script) {
      case 'install':
        return pm === 'npm' ? 'npm install' : `${pm} install`;
      case 'build':
        return pm === 'npm' ? 'npm run build' : `${pm} run build`;
      case 'test':
        return pm === 'npm' ? 'npm run test' : `${pm} run test`;
      default:
        return `${pm} run ${script}`;
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
    if (!require('fs').existsSync(packageJsonPath)) {
      throw new Error('Build pipeline requires package.json in workspace root');
    }

    const pkg = JSON.parse(require('fs').readFileSync(packageJsonPath, 'utf8')) as {
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

    const buildHookCtx: Record<string, unknown> = {
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

    const commandsToRun = Array.isArray(buildHookCtx.commands) && buildHookCtx.commands.length > 0
      ? buildHookCtx.commands.map((item: unknown) => String(item))
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

      lastLog = this.trimLog(`${run.stdout}\n${run.stderr}`);
      ctx.latest_command_log = lastLog;
      if (run.timed_out || run.exit_code !== 0) {
        throw new Error(`Command failed: ${command}\n${this.trimLog(lastLog, 12000)}`);
      }
    }

    const persisted = await BuildArtifactService.persistBuildArtifacts({
      execution_id: ctx.execution_id,
      workspace_id: ctx.workspace_id,
      user_id: ctx.user_id,
      workspace_root: ctx.workspace_root,
      agent_id
    });

    return { commands };
  }

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
      this.trimLog(ctx.latest_failure, 8000),
      'Recent workspace tree:',
      tree || '(empty)',
      'Recent file diff summary:',
      ctx.latest_diff_summary || '(none)',
      'Return patch artifacts only, as JSON {"artifacts":[...]} or fenced blocks with explicit path hints.',
      'For existing files, prefer unified diff output and set update_mode="unified_diff" in JSON artifacts.'
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

  public static trimLog(value: string, max: number = 24000): string {
    if (!value) return '';
    return value.length <= max ? value : value.slice(value.length - max);
  }
}
