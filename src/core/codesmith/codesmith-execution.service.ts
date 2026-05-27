import type { IAgentConfig } from '../shims/db-models';
import type { CloudProvider } from './cloud-deploy-adapter';
import type { CodeSmithContext } from './types';
import { CodeSmithDeploymentService } from './codesmith-deployment.service';
import { CodeSmithDispatcherService } from './codesmith-dispatcher.service';
import { CodeSmithWorkspaceService } from './codesmith-workspace.service';

/**
 * Backward-compatible facade around modular CodeSmith services.
 * This class preserves existing imports while delegating responsibilities
 * to focused services with single responsibility.
 */
export class CodeSmithExecutionService {
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
        return CodeSmithDispatcherService.executeAgentTask(execution_id, agentConfig, config);
    }

    public static async requestClarification(
        fromAgent: string,
        toAgent: string,
        question: string,
        context?: {
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
    ): Promise<{ clarification: string; model: string; question: string }> {
        return CodeSmithDispatcherService.requestClarification(fromAgent, toAgent, question, context);
    }

    public static async maybeScheduleCleanup(
        execution_id: string,
        workspace_id: string,
        user_id: string
    ): Promise<void> {
        return CodeSmithWorkspaceService.maybeScheduleCleanup(execution_id, workspace_id, user_id);
    }

    public static async getFileTree(execution_id: string, relativePath: string = ''): Promise<string[]> {
        return CodeSmithWorkspaceService.getFileTree(execution_id, relativePath);
    }

    public static async getFileContent(execution_id: string, relativePath: string): Promise<string> {
        return CodeSmithWorkspaceService.getFileContent(execution_id, relativePath);
    }

    public static async listBuildArtifacts(execution_id: string): Promise<unknown[]> {
        return CodeSmithWorkspaceService.listBuildArtifacts(execution_id);
    }

    public static async listExecutionLogs(execution_id: string, limit: number = 500): Promise<unknown[]> {
        return CodeSmithWorkspaceService.listExecutionLogs(execution_id, limit);
    }

    public static async deployExecution(
        execution_id: string,
        _auto_deploy: boolean = false,
        custom_domain?: string
    ): Promise<{ deployment_id: string; url: string; status: string }> {
        return CodeSmithDeploymentService.deployExecution(execution_id, custom_domain);
    }

    public static async rollbackDeployment(deployment_id: string): Promise<{ deployment_id: string; status: string; restored_url?: string }> {
        return CodeSmithDeploymentService.rollbackDeployment(deployment_id);
    }

    public static async attachCustomDomain(deployment_id: string, custom_domain: string): Promise<{ deployment_id: string; public_url: string }> {
        return CodeSmithDeploymentService.attachCustomDomain(deployment_id, custom_domain);
    }

    public static async detachCustomDomain(deployment_id: string): Promise<{ deployment_id: string; public_url: string }> {
        return CodeSmithDeploymentService.detachCustomDomain(deployment_id);
    }

    public static async deployToCloud(
        execution_id: string,
        provider: CloudProvider | 'auto' = 'auto'
    ): Promise<{ deployment_id: string; url: string; status: string; provider: CloudProvider }> {
        return CodeSmithDeploymentService.deployToCloud(execution_id, provider);
    }

    public static getAvailableCloudProviders(): { provider: CloudProvider; configured: boolean }[] {
        return CodeSmithDeploymentService.getAvailableCloudProviders();
    }

    public static async replayExecution(execution_id: string): Promise<{
        files_replayed: number;
        commands_replayed: number;
        artifacts_persisted: number;
    }> {
        return CodeSmithWorkspaceService.replayExecution(execution_id);
    }

    public static async hydrateExecutionContext(execution_id: string): Promise<CodeSmithContext> {
        return CodeSmithWorkspaceService.hydrateExecutionContext(execution_id);
    }
}
