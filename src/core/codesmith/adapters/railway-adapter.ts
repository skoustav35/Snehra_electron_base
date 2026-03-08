/**
 * Railway Cloud Deployment Adapter
 * 
 * Deploys applications to Railway via their GraphQL API:
 * - Creates projects and services
 * - Deploys via Dockerfile or Nixpacks
 * - Provides .railway.app subdomain
 * - Supports database add-ons
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../../shims/logger';
import {
    BaseCloudAdapter,
    CloudDeployConfig,
    CloudDeploymentResult,
    DeploymentInfo,
    DeploymentStatus,
    loadCloudCredentials,
} from '../cloud-deploy-adapter';

const RAILWAY_API_BASE = 'https://backboard.railway.app/graphql/v2';

export class RailwayAdapter extends BaseCloudAdapter {
    readonly provider = 'railway' as const;
    private token: string | null = null;

    constructor() {
        super();
        const creds = loadCloudCredentials();
        this.token = creds.railway?.token || null;
    }

    isConfigured(): boolean {
        return !!this.token;
    }

    async validateCredentials(): Promise<boolean> {
        if (!this.token) return false;

        try {
            const result = await this.graphql<{ me?: { id?: string } }>(`query { me { id email } }`);
            return !!result?.me?.id;
        } catch {
            return false;
        }
    }

    async deploy(config: CloudDeployConfig): Promise<CloudDeploymentResult> {
        if (!this.isConfigured()) {
            return this.createErrorResult('Railway token not configured. Set RAILWAY_TOKEN environment variable.');
        }

        const projectName = this.sanitizeProjectName(config.projectName);

        logger.info('[RailwayAdapter] Starting deployment', { projectName, framework: config.framework });

        try {
            // Step 1: Create or get project
            const project = await this.ensureProject(projectName);

            // Step 2: Create service in project
            const service = await this.createService(project.id, projectName);

            // Step 3: Set environment variables
            if (config.environment && Object.keys(config.environment).length > 0) {
                await this.setEnvironmentVariables(service.id, config.environment);
            }

            // Step 4: Create deployment
            // Note: Railway typically deploys from GitHub or via CLI
            // For source uploads, we'll use their deployment from source endpoint
            const deployment = await this.createDeployment(service.id, config.workspaceRoot);

            if (!deployment.success) {
                return deployment;
            }

            // Step 5: Wait for deployment
            const finalStatus = await this.waitForDeployment(deployment.deploymentId, 300000);

            // Get the public URL
            const serviceUrl = await this.getServiceUrl(service.id);

            return {
                success: finalStatus.status === 'ready',
                provider: 'railway',
                deploymentId: deployment.deploymentId,
                status: finalStatus.status,
                url: serviceUrl,
                error: finalStatus.error,
                metadata: {
                    projectId: project.id,
                    serviceId: service.id,
                    createdAt: new Date(),
                },
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error('[RailwayAdapter] Deployment error', { error: message });
            return this.createErrorResult(message);
        }
    }

    async getStatus(deploymentId: string): Promise<DeploymentInfo | null> {
        if (!this.isConfigured()) return null;

        try {
            const result = await this.graphql<{
                deployment?: {
                    id: string;
                    status?: string;
                    createdAt: string;
                    staticUrl?: string;
                };
            }>(`
                query GetDeployment($id: String!) {
                    deployment(id: $id) {
                        id
                        status
                        createdAt
                        staticUrl
                    }
                }
            `, { id: deploymentId });

            if (!result?.deployment) return null;

            return {
                deploymentId: result.deployment.id,
                status: this.mapRailwayStatus(result.deployment.status),
                url: result.deployment.staticUrl,
                createdAt: new Date(result.deployment.createdAt),
                updatedAt: new Date(),
            };
        } catch {
            return null;
        }
    }

    async getLogs(deploymentId: string): Promise<string[]> {
        if (!this.isConfigured()) return [];

        try {
            const result = await this.graphql<{
                deploymentLogs?: Array<{ message?: string }>;
            }>(`
                query GetDeploymentLogs($id: String!) {
                    deploymentLogs(deploymentId: $id, limit: 100) {
                        message
                        timestamp
                    }
                }
            `, { id: deploymentId });

            return (result?.deploymentLogs || []).map((log) => log.message || '');
        } catch {
            return [];
        }
    }

    async cancel(deploymentId: string): Promise<boolean> {
        if (!this.isConfigured()) return false;

        try {
            await this.graphql(`
                mutation CancelDeployment($id: String!) {
                    deploymentCancel(id: $id)
                }
            `, { id: deploymentId });
            return true;
        } catch {
            return false;
        }
    }

    async remove(deploymentId: string): Promise<boolean> {
        if (!this.isConfigured()) return false;

        try {
            await this.graphql(`
                mutation RemoveDeployment($id: String!) {
                    deploymentRemove(id: $id)
                }
            `, { id: deploymentId });
            return true;
        } catch {
            return false;
        }
    }

    async listDeployments(projectName: string, limit: number = 10): Promise<DeploymentInfo[]> {
        if (!this.isConfigured()) return [];

        try {
            const result = await this.graphql<{
                project?: {
                    deployments?: {
                        edges?: Array<{
                            node: {
                                id: string;
                                status?: string;
                                createdAt: string;
                                staticUrl?: string;
                            };
                        }>;
                    };
                };
            }>(`
                query ListDeployments($name: String!, $limit: Int!) {
                    project(name: $name) {
                        deployments(first: $limit) {
                            edges {
                                node {
                                    id
                                    status
                                    createdAt
                                    staticUrl
                                }
                            }
                        }
                    }
                }
            `, { name: projectName, limit });

            return (result?.project?.deployments?.edges || []).map((edge) => ({
                deploymentId: edge.node.id,
                status: this.mapRailwayStatus(edge.node.status),
                url: edge.node.staticUrl,
                createdAt: new Date(edge.node.createdAt),
                updatedAt: new Date(edge.node.createdAt),
            }));
        } catch {
            return [];
        }
    }

    // Private helpers

    private async graphql<T = unknown>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
        const response = await fetch(RAILWAY_API_BASE, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query, variables }),
        });

        if (!response.ok) {
            throw new Error(`Railway API error: ${response.status}`);
        }

        const result = await response.json() as { data?: T; errors?: Array<{ message?: string }> };

        if (result.errors) {
            throw new Error(result.errors[0]?.message || 'GraphQL error');
        }

        return result.data as T;
    }

    private async ensureProject(name: string): Promise<{ id: string; name: string }> {
        // Try to find existing project
        const existing = await this.graphql<{
            project?: { id: string; name: string };
        }>(`
            query FindProject($name: String!) {
                project(name: $name) {
                    id
                    name
                }
            }
        `, { name });

        if (existing?.project) {
            return existing.project;
        }

        // Create new project
        const created = await this.graphql<{
            projectCreate: { id: string; name: string };
        }>(`
            mutation CreateProject($name: String!) {
                projectCreate(input: { name: $name }) {
                    id
                    name
                }
            }
        `, { name });

        return created.projectCreate;
    }

    private async createService(
        projectId: string,
        name: string
    ): Promise<{ id: string; name: string }> {
        const result = await this.graphql<{
            serviceCreate: { id: string; name: string };
        }>(`
            mutation CreateService($projectId: String!, $name: String!) {
                serviceCreate(input: { projectId: $projectId, name: $name }) {
                    id
                    name
                }
            }
        `, { projectId, name });

        return result.serviceCreate;
    }

    private async setEnvironmentVariables(
        serviceId: string,
        variables: Record<string, string>
    ): Promise<void> {
        for (const [name, value] of Object.entries(variables)) {
            await this.graphql(`
                mutation SetVariable($serviceId: String!, $name: String!, $value: String!) {
                    variableUpsert(input: { serviceId: $serviceId, name: $name, value: $value })
                }
            `, { serviceId, name, value });
        }
    }

    private async createDeployment(
        serviceId: string,
        workspaceRoot: string
    ): Promise<CloudDeploymentResult> {
        // Railway's primary deployment method is via GitHub integration
        // For CLI/API uploads, we need to use their deployment endpoint
        // This is a simplified version - full implementation would use their CLI

        try {
            const result = await this.graphql<{
                serviceInstanceDeploy: {
                    id: string;
                };
            }>(`
                mutation TriggerDeploy($serviceId: String!) {
                    serviceInstanceDeploy(serviceId: $serviceId) {
                        id
                    }
                }
            `, { serviceId });

            return {
                success: true,
                provider: 'railway',
                deploymentId: result.serviceInstanceDeploy.id,
                status: 'pending',
            };
        } catch (error) {
            return this.createErrorResult(
                `Failed to trigger deployment. Note: Railway works best with GitHub integration. ` +
                `Consider pushing to a GitHub repo and connecting it to Railway.`
            );
        }
    }

    private async getServiceUrl(serviceId: string): Promise<string | undefined> {
        try {
            const result = await this.graphql<{
                service?: {
                    domains?: Array<{ domain?: string }>;
                };
            }>(`
                query GetServiceDomain($id: String!) {
                    service(id: $id) {
                        domains {
                            domain
                        }
                    }
                }
            `, { id: serviceId });

            const domains = result?.service?.domains || [];
            return domains[0]?.domain ? `https://${domains[0].domain}` : undefined;
        } catch {
            return undefined;
        }
    }

    private async waitForDeployment(
        deploymentId: string,
        timeoutMs: number
    ): Promise<{ status: DeploymentStatus; error?: string }> {
        const startTime = Date.now();
        const pollInterval = 5000;

        while (Date.now() - startTime < timeoutMs) {
            const status = await this.getStatus(deploymentId);

            if (!status) {
                return { status: 'failed', error: 'Could not fetch deployment status' };
            }

            if (status.status === 'ready') {
                return { status: 'ready' };
            }

            if (status.status === 'failed' || status.status === 'cancelled') {
                return { status: status.status, error: status.error };
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        return { status: 'failed', error: 'Deployment timed out' };
    }

    private mapRailwayStatus(status?: string): DeploymentStatus {
        switch (status?.toUpperCase()) {
            case 'BUILDING':
                return 'building';
            case 'DEPLOYING':
                return 'deploying';
            case 'SUCCESS':
            case 'RUNNING':
                return 'ready';
            case 'FAILED':
            case 'CRASHED':
                return 'failed';
            case 'REMOVED':
            case 'CANCELLED':
                return 'cancelled';
            default:
                return 'pending';
        }
    }
}
