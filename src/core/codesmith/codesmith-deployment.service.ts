import { EventType } from '../shims/events';
import { eventStore } from '../shims/event-store';
import { AdminConfig } from '../shims/admin-config';
import { pluginManager } from '../shims/plugin-manager';
import { CodeSmithWorkspaceManager } from './workspace-manager';
import { deployToCloud, deployToAnyCloud, listAvailableProviders } from './cloud-adapter-factory';
import type { CloudDeployConfig, CloudProvider } from './cloud-deploy-adapter';
import { DeploymentGeneratorService } from './deployment-generator.service';
import { DeployAgent } from './deploy-agent';

export class CodeSmithDeploymentService {
    public static async deployExecution(
        execution_id: string,
        custom_domain?: string
    ): Promise<{ deployment_id: string; url: string; status: string }> {
        await this.assertQualityGatePassed(execution_id);
        const deploymentStatus = await DeployAgent.deployExecution({ execution_id, custom_domain });
        return {
            deployment_id: deploymentStatus.deployment_id,
            url: deploymentStatus.public_url,
            status: deploymentStatus.status
        };
    }

    public static async rollbackDeployment(deployment_id: string): Promise<{ deployment_id: string; status: string; restored_url?: string }> {
        return DeployAgent.rollbackDeployment(deployment_id);
    }

    public static async attachCustomDomain(deployment_id: string, custom_domain: string): Promise<{ deployment_id: string; public_url: string }> {
        return DeployAgent.attachCustomDomain(deployment_id, custom_domain);
    }

    public static async detachCustomDomain(deployment_id: string): Promise<{ deployment_id: string; public_url: string }> {
        return DeployAgent.detachCustomDomain(deployment_id);
    }

    public static async deployToCloud(
        execution_id: string,
        provider: CloudProvider | 'auto' = 'auto'
    ): Promise<{ deployment_id: string; url: string; status: string; provider: CloudProvider }> {
        await this.assertQualityGatePassed(execution_id);
        const created = await eventStore.getLatestEvent(execution_id, EventType.EXECUTION_CREATED);
        if (!created) {
            throw new Error(`Execution not found: ${execution_id}`);
        }

        const workspace_id = created.workspace_id;
        const user_id = created.user_id;
        const paths = CodeSmithWorkspaceManager.getExecutionPaths(workspace_id, execution_id);

        await eventStore.appendEvent({
            execution_id,
            workspace_id,
            user_id,
            agent_id: null,
            event_type: EventType.DEPLOYMENT_LOG,
            payload: { message: 'Starting cloud deployment', level: 'info', provider }
        });

        const { config } = await DeploymentGeneratorService.writeDeploymentFiles(paths.root);
        const projectName = `codesmith-${execution_id.substring(0, 8)}`;

        await eventStore.appendEvent({
            execution_id,
            workspace_id,
            user_id,
            agent_id: null,
            event_type: EventType.DEPLOYMENT_LOG,
            payload: {
                message: `Detected framework: ${config.framework}, deploying to ${provider}`,
                level: 'info'
            }
        });

        const cloudConfig: CloudDeployConfig = {
            provider: provider === 'auto' ? 'vercel' : provider,
            projectName,
            workspaceRoot: paths.root,
            framework: config.framework,
            environment: {}
        };

        const result = provider === 'auto'
            ? await deployToAnyCloud(cloudConfig)
            : await deployToCloud(cloudConfig);

        await eventStore.appendEvent({
            execution_id,
            workspace_id,
            user_id,
            agent_id: null,
            event_type: EventType.DEPLOYMENT_LOG,
            payload: {
                message: result.success
                    ? `Deployed successfully to ${result.url}`
                    : `Deployment failed: ${result.error}`,
                level: result.success ? 'info' : 'error',
                url: result.url,
                provider: result.provider
            }
        });

        if (!result.success) {
            throw new Error(`Cloud deployment failed: ${result.error}`);
        }

        await pluginManager.onAfterDeploy({
            execution_id,
            workspace_id,
            user_id,
            deployment_id: result.deploymentId,
            url: result.url,
            status: result.status,
            provider: result.provider,
            policy: AdminConfig.getDeploymentPolicy(workspace_id),
            budget: AdminConfig.getCostLimits(workspace_id)
        });

        return {
            deployment_id: result.deploymentId,
            url: result.url!,
            status: result.status,
            provider: result.provider
        };
    }

    public static getAvailableCloudProviders(): { provider: CloudProvider; configured: boolean }[] {
        return listAvailableProviders();
    }

    private static async assertQualityGatePassed(execution_id: string): Promise<void> {
        const completed = await eventStore.getLatestEvent(execution_id, EventType.EXECUTION_COMPLETED);
        if (!completed) {
            throw new Error('Deployment blocked: execution has not completed');
        }
        if (completed.payload?.quality_gate_passed !== true) {
            throw new Error('Deployment blocked: tester/debugger quality gate did not pass');
        }

        const qualityEvents = await eventStore.getEventsByType(execution_id, [
            EventType.AGENT_COMPLETED,
            EventType.AGENT_FAILED
        ]);
        const requiredAgents = ['codesmith:tester', 'codesmith:debugger'];
        for (const agentId of requiredAgents) {
            const completions = qualityEvents
                .filter((event) => event.event_type === EventType.AGENT_COMPLETED && event.agent_id === agentId)
                .sort((a, b) => a.sequence - b.sequence);
            if (completions.length === 0) {
                throw new Error(`Deployment blocked: missing successful ${agentId} run`);
            }
            const latestCompletion = completions[completions.length - 1];
            const unresolvedFailure = qualityEvents.some((event) =>
                event.event_type === EventType.AGENT_FAILED
                && event.agent_id === agentId
                && event.sequence > latestCompletion.sequence
            );
            if (unresolvedFailure) {
                throw new Error(`Deployment blocked: ${agentId} has unresolved failures`);
            }
        }
    }
}
