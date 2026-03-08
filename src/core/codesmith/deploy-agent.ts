import { eventStore } from '../shims/event-store';
import { EventType } from '../shims/events';
import { logger } from '../shims/logger';
import { Deployment } from '../shims/db-models';
import { BuildArtifact } from '../shims/db-models';
import { CodeSmithWorkspaceManager } from './workspace-manager';
import { DeploymentExecutorService } from './deployment-executor.service';
import { DeploymentGeneratorService } from './deployment-generator.service';
import { AdminConfig } from '../shims/admin-config';
import { pluginManager } from '../shims/plugin-manager';
import { CreditManager } from '../shims/credit-manager';

interface DeployParams {
    execution_id: string;
    custom_domain?: string;
}

export interface DeployResult {
    deployment_id: string;
    execution_id: string;
    public_url: string;
    status: string;
    rollback_supported: boolean;
}

export class DeployAgent {
    public static async deployExecution(params: DeployParams): Promise<DeployResult> {
        const created = await eventStore.getLatestEvent(params.execution_id, EventType.EXECUTION_CREATED);
        if (!created) {
            throw new Error(`Execution not found: ${params.execution_id}`);
        }

        const workspace_id = created.workspace_id;
        const user_id = created.user_id;
        if (!AdminConfig.isDeploymentEnabled(workspace_id)) {
            throw new Error('Deployment is disabled by admin policy');
        }

        const buildCount = await BuildArtifact.countDocuments({ execution_id: params.execution_id }).exec();
        if (buildCount === 0) {
            throw new Error('No build artifacts found for execution; run build/preview before deployment');
        }
        const costLimits = AdminConfig.getCostLimits(workspace_id);
        const estimatedDeployCost = 12;
        if (estimatedDeployCost > costLimits.max_cost_per_execution) {
            throw new Error('Deployment estimated cost exceeds max_cost_per_execution policy');
        }

        const paths = CodeSmithWorkspaceManager.getExecutionPaths(workspace_id, params.execution_id);
        const previousActive = await Deployment.findOne({
            workspace_id,
            status: 'success',
            active: true
        })
            .sort({ deployment_version: -1, created_at: -1 })
            .exec();

        const deployment_version = (previousActive?.deployment_version || 0) + 1;
        await eventStore.appendEvent({
            execution_id: params.execution_id,
            workspace_id,
            user_id,
            agent_id: null,
            event_type: EventType.DEPLOYMENT_LOG,
            payload: {
                message: 'DeployAgent validation completed',
                level: 'info',
                build_artifacts: buildCount,
                deployment_version
            }
        });

        const { config } = await DeploymentGeneratorService.writeDeploymentFiles(paths.root);
        const invalidEnvEntries = (config.environmentVars || []).filter((entry) => !/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(entry));
        if (invalidEnvEntries.length > 0) {
            throw new Error(`Invalid deployment env entries: ${invalidEnvEntries.join(', ')}`);
        }
        const { image_tag } = await DeploymentExecutorService.buildDockerImage(
            params.execution_id,
            workspace_id,
            user_id,
            paths.root,
            config.framework
        );

        const deployment = await DeploymentExecutorService.deployLocal(
            params.execution_id,
            workspace_id,
            user_id,
            image_tag,
            config
        );

        if (deployment.status === 'failed' || !deployment.deployment_id) {
            throw new Error(`Deployment failed: ${deployment.error || 'unknown error'}`);
        }

        const public_url = this.resolvePublicUrl({
            workspace_id,
            execution_id: params.execution_id,
            local_url: deployment.url || '',
            custom_domain: params.custom_domain
        });

        await Deployment.findOneAndUpdate(
            { deployment_id: deployment.deployment_id },
            {
                $set: {
                    public_url,
                    custom_domain: params.custom_domain || null,
                    ssl_enabled: AdminConfig.getDomainSslConfig(workspace_id).ssl_enabled,
                    deployment_version,
                    previous_deployment_id: previousActive?.deployment_id || null,
                    active: true,
                    rollback_available: true,
                    status: 'success',
                    ended_at: new Date()
                }
            }
        ).exec();

        if (previousActive) {
            await Deployment.findOneAndUpdate(
                { deployment_id: previousActive.deployment_id },
                { $set: { active: false } }
            ).exec();
        }

        await eventStore.appendEvent({
            execution_id: params.execution_id,
            workspace_id,
            user_id,
            agent_id: null,
            event_type: EventType.DEPLOYMENT_COMPLETED,
            payload: {
                deployment_id: deployment.deployment_id,
                public_url,
                status: 'success',
                rollback_supported: true,
                deployment_version
            }
        });

        await CreditManager.debit(
            params.execution_id,
            user_id,
            workspace_id,
            Math.min(estimatedDeployCost, costLimits.max_cost_per_model_call),
            'deploy_agent'
        );

        await pluginManager.onAfterDeploy({
            execution_id: params.execution_id,
            workspace_id,
            user_id,
            deployment_id: deployment.deployment_id,
            public_url,
            policy: AdminConfig.getDeploymentPolicy(workspace_id),
            budget: AdminConfig.getCostLimits(workspace_id)
        });

        return {
            deployment_id: deployment.deployment_id,
            execution_id: params.execution_id,
            public_url,
            status: 'success',
            rollback_supported: true
        };
    }

    public static async rollbackDeployment(deployment_id: string): Promise<{
        deployment_id: string;
        status: string;
        restored_url?: string;
    }> {
        const deployment = await Deployment.findOne({ deployment_id }).exec();
        if (!deployment) {
            throw new Error(`Deployment not found: ${deployment_id}`);
        }

        await DeploymentExecutorService.stopDeployment(deployment_id);
        await Deployment.findOneAndUpdate(
            { deployment_id },
            {
                $set: {
                    status: 'rolled_back',
                    active: false,
                    rollback_available: false,
                    ended_at: new Date()
                }
            }
        ).exec();

        let restored_url: string | undefined;
        if (deployment.previous_deployment_id) {
            const previous = await Deployment.findOne({ deployment_id: deployment.previous_deployment_id }).exec();
            if (previous) {
                previous.active = true;
                await previous.save();
                restored_url = previous.public_url || previous.deployed_urls?.[0];
            }
        }

        await eventStore.appendEvent({
            execution_id: deployment.execution_id,
            workspace_id: deployment.workspace_id,
            user_id: deployment.user_id,
            agent_id: null,
            event_type: EventType.DEPLOYMENT_ROLLBACK,
            payload: {
                deployment_id,
                restored_url: restored_url || null
            }
        });

        return {
            deployment_id,
            status: 'rolled_back',
            restored_url
        };
    }

    public static async attachCustomDomain(deployment_id: string, custom_domain: string): Promise<{ deployment_id: string; public_url: string }> {
        const deployment = await Deployment.findOne({ deployment_id }).exec();
        if (!deployment) {
            throw new Error(`Deployment not found: ${deployment_id}`);
        }

        const domainConfig = AdminConfig.getDomainSslConfig(deployment.workspace_id);
        if (!domainConfig.allow_custom_domains) {
            throw new Error('Custom domains are disabled by admin policy');
        }

        const scheme = domainConfig.ssl_enabled ? 'https' : AdminConfig.getDeploymentPolicy(deployment.workspace_id).scheme;
        const public_url = `${scheme}://${custom_domain}`;
        deployment.custom_domain = custom_domain;
        deployment.public_url = public_url;
        deployment.ssl_enabled = domainConfig.ssl_enabled;
        await deployment.save();

        return { deployment_id, public_url };
    }

    public static async detachCustomDomain(deployment_id: string): Promise<{ deployment_id: string; public_url: string }> {
        const deployment = await Deployment.findOne({ deployment_id }).exec();
        if (!deployment) {
            throw new Error(`Deployment not found: ${deployment_id}`);
        }

        deployment.custom_domain = null;
        deployment.public_url = deployment.deployed_urls?.[0] || '';
        await deployment.save();
        return { deployment_id, public_url: deployment.public_url || '' };
    }

    private static resolvePublicUrl(params: {
        workspace_id: string;
        execution_id: string;
        local_url: string;
        custom_domain?: string;
    }): string {
        const domainConfig = AdminConfig.getDomainSslConfig(params.workspace_id);
        const scheme = domainConfig.ssl_enabled ? 'https' : AdminConfig.getDeploymentPolicy(params.workspace_id).scheme;

        if (params.custom_domain) {
            if (!domainConfig.allow_custom_domains) {
                throw new Error('Custom domains are disabled by admin policy');
            }
            return `${scheme}://${params.custom_domain}`;
        }

        if (domainConfig.public_gateway_base_url) {
            const shortExecution = params.execution_id.slice(0, 8);
            const slugWorkspace = params.workspace_id.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
            const subdomain = `${domainConfig.auto_subdomain_prefix}-${slugWorkspace}-${shortExecution}`.replace(/--+/g, '-');
            return `${scheme}://${subdomain}.${domainConfig.base_domain}`;
        }

        if (!params.local_url) {
            throw new Error('No deployment URL available to expose as public_url');
        }
        return params.local_url;
    }
}
