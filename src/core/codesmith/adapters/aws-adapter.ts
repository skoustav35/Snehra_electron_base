/**
 * AWS Cloud Deployment Adapter
 * 
 * Deploys applications to AWS using:
 * - ECR: Container registry for Docker images
 * - ECS/Fargate: Serverless container orchestration
 * - ALB: Application load balancer
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import { logger } from '../../shims/logger';
import { AdminConfig } from '../../shims/admin-config';
import { BaseCloudAdapter, loadCloudCredentials } from '../cloud-deploy-adapter';
import type {
    CloudDeployConfig,
    CloudDeploymentResult,
    DeploymentInfo,
    DeploymentStatus,
} from '../cloud-deploy-adapter';

const execAsync = promisify(exec);

// AWS SDK would normally be imported here
// For now, we'll use AWS CLI commands as a fallback

interface AWSCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
}

export class AWSAdapter extends BaseCloudAdapter {
    readonly provider = 'aws' as const;
    private credentials: AWSCredentials | null = null;

    constructor() {
        super();
        const creds = loadCloudCredentials();
        if (creds.aws) {
            this.credentials = creds.aws;
        }
    }

    isConfigured(): boolean {
        return !!(this.credentials?.accessKeyId && this.credentials?.secretAccessKey);
    }

    async validateCredentials(): Promise<boolean> {
        if (!this.isConfigured()) return false;

        try {
            const { stdout } = await this.awsCli('sts get-caller-identity');
            return stdout.includes('Account');
        } catch {
            return false;
        }
    }

    async deploy(config: CloudDeployConfig): Promise<CloudDeploymentResult> {
        if (!this.isConfigured()) {
            return this.createErrorResult(
                'AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.'
            );
        }

        const projectName = this.sanitizeProjectName(config.projectName);
        const region = config.region || this.credentials!.region;

        logger.info('[AWSAdapter] Starting deployment', { projectName, region, framework: config.framework });

        try {
            // Step 1: Create ECR repository (if not exists)
            const ecrRepo = await this.ensureECRRepository(projectName, region);

            // Step 2: Build and push Docker image
            const imageUri = await this.buildAndPushImage(
                config.workspaceRoot,
                ecrRepo,
                projectName,
                region
            );

            // Step 3: Create/update ECS task definition
            const taskDefinition = await this.createTaskDefinition(
                projectName,
                imageUri,
                config,
                region
            );

            // Step 4: Create/update ECS service
            const service = await this.ensureECSService(
                projectName,
                taskDefinition,
                config,
                region
            );

            // Step 5: Wait for service stability
            const deploymentId = `${projectName}-${Date.now()}`;
            const finalStatus = await this.waitForServiceStability(
                projectName,
                config.aws?.cluster || 'default',
                region,
                300000
            );

            // Resolve service URL from ECS -> Target Group -> ALB DNS.
            const serviceUrl = await this.getServiceUrl(projectName, region);
            if (finalStatus.status === 'ready' && !serviceUrl) {
                return this.createErrorResult(
                    'Deployment reached ready state but no AWS ALB URL could be resolved for the service.'
                );
            }

            return {
                success: finalStatus.status === 'ready',
                provider: 'aws',
                deploymentId,
                status: finalStatus.status,
                url: serviceUrl,
                error: finalStatus.error,
                metadata: {
                    region,
                    createdAt: new Date(),
                },
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error('[AWSAdapter] Deployment error', { error: message });
            return this.createErrorResult(message);
        }
    }

    async getStatus(deploymentId: string): Promise<DeploymentInfo | null> {
        // Parse deployment ID to get service name
        const parts = deploymentId.split('-');
        parts.pop(); // Remove timestamp
        const serviceName = parts.join('-');
        const region = this.credentials?.region || 'us-east-1';

        try {
            const { stdout } = await this.awsCli(
                `ecs describe-services --cluster default --services ${serviceName} --region ${region}`
            );
            const data = JSON.parse(stdout);
            const service = data.services?.[0];

            if (!service) return null;

            return {
                deploymentId,
                status: this.mapECSStatus(service.status, service.runningCount, service.desiredCount),
                createdAt: new Date(service.createdAt),
                updatedAt: new Date(),
            };
        } catch {
            return null;
        }
    }

    async getLogs(deploymentId: string): Promise<string[]> {
        // Would use CloudWatch Logs here
        return ['AWS CloudWatch logs retrieval not implemented - use AWS Console'];
    }

    async cancel(deploymentId: string): Promise<boolean> {
        // ECS deployments can't really be "cancelled" - you update to a new version
        return false;
    }

    async remove(deploymentId: string): Promise<boolean> {
        const parts = deploymentId.split('-');
        parts.pop();
        const serviceName = parts.join('-');
        const region = this.credentials?.region || 'us-east-1';

        try {
            // Scale down to 0
            await this.awsCli(
                `ecs update-service --cluster default --service ${serviceName} --desired-count 0 --region ${region}`
            );

            // Delete service
            await this.awsCli(
                `ecs delete-service --cluster default --service ${serviceName} --region ${region}`
            );

            return true;
        } catch {
            return false;
        }
    }

    async listDeployments(projectName: string, limit: number = 10): Promise<DeploymentInfo[]> {
        const region = this.credentials?.region || 'us-east-1';

        try {
            const { stdout } = await this.awsCli(
                `ecs list-services --cluster default --region ${region}`
            );
            const data = JSON.parse(stdout);

            const deployments: DeploymentInfo[] = [];
            for (const arn of (data.serviceArns || []).slice(0, limit)) {
                const serviceName = arn.split('/').pop();
                if (serviceName?.startsWith(projectName)) {
                    deployments.push({
                        deploymentId: `${serviceName}-${Date.now()}`,
                        status: 'ready',
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    });
                }
            }

            return deployments;
        } catch {
            return [];
        }
    }

    // Private helpers

    private async awsCli(command: string): Promise<{ stdout: string; stderr: string }> {
        const env = {
            ...AdminConfig.getChildProcessEnv(),
            AWS_ACCESS_KEY_ID: this.credentials!.accessKeyId,
            AWS_SECRET_ACCESS_KEY: this.credentials!.secretAccessKey,
            AWS_DEFAULT_REGION: this.credentials!.region,
        };

        return execAsync(`aws ${command}`, { env, maxBuffer: 10 * 1024 * 1024 });
    }

    private async ensureECRRepository(
        name: string,
        region: string
    ): Promise<string> {
        try {
            const { stdout } = await this.awsCli(
                `ecr describe-repositories --repository-names ${name} --region ${region}`
            );
            const data = JSON.parse(stdout);
            return data.repositories[0].repositoryUri;
        } catch {
            // Create repository
            const { stdout } = await this.awsCli(
                `ecr create-repository --repository-name ${name} --region ${region}`
            );
            const data = JSON.parse(stdout);
            return data.repository.repositoryUri;
        }
    }

    private async buildAndPushImage(
        workspaceRoot: string,
        ecrRepo: string,
        projectName: string,
        region: string
    ): Promise<string> {
        const imageTag = `${ecrRepo}:latest`;

        // Get ECR login
        const { stdout: loginCmd } = await this.awsCli(
            `ecr get-login-password --region ${region}`
        );

        const registryUrl = ecrRepo.split('/')[0];
        await execAsync(`echo "${loginCmd.trim()}" | docker login --username AWS --password-stdin ${registryUrl}`);

        // Build image
        await execAsync(`docker build -t ${projectName} "${workspaceRoot}"`);

        // Tag and push
        await execAsync(`docker tag ${projectName}:latest ${imageTag}`);
        await execAsync(`docker push ${imageTag}`);

        return imageTag;
    }

    private async createTaskDefinition(
        name: string,
        imageUri: string,
        config: CloudDeployConfig,
        region: string
    ): Promise<string> {
        const cpu = config.aws?.cpu || 256;
        const memory = config.aws?.memory || 512;

        const taskDef = {
            family: name,
            networkMode: 'awsvpc',
            requiresCompatibilities: ['FARGATE'],
            cpu: String(cpu),
            memory: String(memory),
            containerDefinitions: [
                {
                    name,
                    image: imageUri,
                    portMappings: [
                        {
                            containerPort: 3000,
                            protocol: 'tcp',
                        },
                    ],
                    environment: Object.entries(config.environment || {}).map(([name, value]) => ({
                        name,
                        value,
                    })),
                    logConfiguration: {
                        logDriver: 'awslogs',
                        options: {
                            'awslogs-group': `/ecs/${name}`,
                            'awslogs-region': region,
                            'awslogs-stream-prefix': 'ecs',
                        },
                    },
                },
            ],
        };

        // Write task definition to temp file
        const tempFile = `/tmp/task-def-${name}.json`;
        const fs = await import('fs');
        fs.writeFileSync(tempFile, JSON.stringify(taskDef));

        const { stdout } = await this.awsCli(
            `ecs register-task-definition --cli-input-json file://${tempFile} --region ${region}`
        );

        const data = JSON.parse(stdout);
        return `${data.taskDefinition.family}:${data.taskDefinition.revision}`;
    }

    private async ensureECSService(
        name: string,
        taskDefinition: string,
        config: CloudDeployConfig,
        region: string
    ): Promise<{ name: string }> {
        const cluster = config.aws?.cluster || 'default';
        const desiredCount = config.aws?.desiredCount || 1;

        try {
            // Check if service exists
            const { stdout } = await this.awsCli(
                `ecs describe-services --cluster ${cluster} --services ${name} --region ${region}`
            );
            const data = JSON.parse(stdout);

            if (data.services?.[0]?.status === 'ACTIVE') {
                // Update existing service
                await this.awsCli(
                    `ecs update-service --cluster ${cluster} --service ${name} ` +
                    `--task-definition ${taskDefinition} --desired-count ${desiredCount} --region ${region}`
                );
            } else {
                throw new Error('Service not active');
            }
        } catch {
            // Create new service
            await this.awsCli(
                `ecs create-service --cluster ${cluster} --service-name ${name} ` +
                `--task-definition ${taskDefinition} --desired-count ${desiredCount} ` +
                `--launch-type FARGATE --region ${region} ` +
                `--network-configuration "awsvpcConfiguration={subnets=[${config.aws?.subnets?.join(',') || 'subnet-default'
                }],securityGroups=[${config.aws?.securityGroups?.join(',') || 'sg-default'
                }],assignPublicIp=ENABLED}"`
            );
        }

        return { name };
    }

    private async waitForServiceStability(
        serviceName: string,
        cluster: string,
        region: string,
        timeoutMs: number
    ): Promise<{ status: DeploymentStatus; error?: string }> {
        const startTime = Date.now();
        const pollInterval = 10000;

        while (Date.now() - startTime < timeoutMs) {
            try {
                const { stdout } = await this.awsCli(
                    `ecs describe-services --cluster ${cluster} --services ${serviceName} --region ${region}`
                );
                const data = JSON.parse(stdout);
                const service = data.services?.[0];

                if (service?.runningCount === service?.desiredCount && service?.runningCount > 0) {
                    return { status: 'ready' };
                }

                if (service?.status === 'INACTIVE') {
                    return { status: 'failed', error: 'Service became inactive' };
                }
            } catch (error) {
                // Continue polling
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        return { status: 'failed', error: 'Deployment timed out' };
    }

    private async getServiceUrl(serviceName: string, region: string): Promise<string | undefined> {
        try {
            const { stdout: serviceOut } = await this.awsCli(
                `ecs describe-services --cluster default --services ${serviceName} --region ${region}`
            );
            const serviceData = JSON.parse(serviceOut);
            const targetGroupArn = serviceData.services?.[0]?.loadBalancers?.[0]?.targetGroupArn;
            if (!targetGroupArn) {
                return undefined;
            }

            const { stdout: tgOut } = await this.awsCli(
                `elbv2 describe-target-groups --target-group-arns ${targetGroupArn} --region ${region}`
            );
            const tgData = JSON.parse(tgOut);
            const loadBalancerArn = tgData.TargetGroups?.[0]?.LoadBalancerArns?.[0];
            if (!loadBalancerArn) {
                return undefined;
            }

            const { stdout: lbOut } = await this.awsCli(
                `elbv2 describe-load-balancers --load-balancer-arns ${loadBalancerArn} --region ${region}`
            );
            const lbData = JSON.parse(lbOut);
            const dnsName = lbData.LoadBalancers?.[0]?.DNSName;
            if (!dnsName) {
                return undefined;
            }
            return `http://${dnsName}`;
        } catch (error) {
            logger.warn('[AWSAdapter] Failed to resolve ALB service URL', {
                serviceName,
                region,
                error: error instanceof Error ? error.message : String(error),
            });
            return undefined;
        }
    }

    private mapECSStatus(status: string, running: number, desired: number): DeploymentStatus {
        if (status === 'ACTIVE' && running === desired && running > 0) {
            return 'ready';
        }
        if (status === 'DRAINING' || status === 'INACTIVE') {
            return 'failed';
        }
        if (running < desired) {
            return 'deploying';
        }
        return 'pending';
    }
}
