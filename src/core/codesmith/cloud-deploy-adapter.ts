/**
 * Cloud Deployment Adapter Interface
 * 
 * Provides a unified interface for deploying to various cloud providers:
 * - Vercel
 * - Railway
 * - AWS (ECS/Fargate)
 */

import type { Framework } from './deployment-generator.service';
import { AdminConfig } from '../shims/admin-config';

// Provider types
export type CloudProvider = 'vercel' | 'railway' | 'aws' | 'local';

// Deployment status
export type DeploymentStatus =
    | 'pending'
    | 'building'
    | 'deploying'
    | 'ready'
    | 'failed'
    | 'cancelled';

// Configuration for cloud deployment
export interface CloudDeployConfig {
    provider: CloudProvider;
    projectName: string;
    workspaceRoot: string;
    framework: Framework;
    environment?: Record<string, string>;
    region?: string;

    // Provider-specific options
    vercel?: VercelConfig;
    railway?: RailwayConfig;
    aws?: AWSConfig;
}

export interface VercelConfig {
    teamId?: string;
    framework?: 'nextjs' | 'vite' | 'create-react-app' | 'vue' | 'nuxt' | 'static';
    buildCommand?: string;
    outputDirectory?: string;
    installCommand?: string;
    rootDirectory?: string;
}

export interface RailwayConfig {
    serviceId?: string;
    startCommand?: string;
    healthcheckPath?: string;
    numReplicas?: number;
    databases?: Array<'postgres' | 'mysql' | 'redis' | 'mongodb'>;
}

export interface AWSConfig {
    cluster?: string;
    serviceName?: string;
    taskDefinition?: string;
    subnets?: string[];
    securityGroups?: string[];
    cpu?: number;
    memory?: number;
    desiredCount?: number;
}

// Deployment result
export interface CloudDeploymentResult {
    success: boolean;
    provider: CloudProvider;
    deploymentId: string;
    status: DeploymentStatus;
    url?: string;
    buildLogs?: string[];
    error?: string;
    metadata?: {
        projectId?: string;
        serviceId?: string;
        region?: string;
        createdAt?: Date;
        buildDuration?: number;
    };
}

// Deployment info for status checks
export interface DeploymentInfo {
    deploymentId: string;
    status: DeploymentStatus;
    url?: string;
    createdAt: Date;
    updatedAt: Date;
    buildLogs?: string[];
    error?: string;
}

/**
 * Cloud Deploy Adapter Interface
 * 
 * All cloud provider adapters must implement this interface.
 */
export interface ICloudDeployAdapter {
    /**
     * Provider identifier
     */
    readonly provider: CloudProvider;

    /**
     * Check if the adapter is configured properly
     */
    isConfigured(): boolean;

    /**
     * Validate credentials
     */
    validateCredentials(): Promise<boolean>;

    /**
     * Deploy application to the cloud
     */
    deploy(config: CloudDeployConfig): Promise<CloudDeploymentResult>;

    /**
     * Get deployment status
     */
    getStatus(deploymentId: string): Promise<DeploymentInfo | null>;

    /**
     * Get deployment logs
     */
    getLogs(deploymentId: string): Promise<string[]>;

    /**
     * Cancel/stop a deployment
     */
    cancel(deploymentId: string): Promise<boolean>;

    /**
     * Remove/delete a deployment
     */
    remove(deploymentId: string): Promise<boolean>;

    /**
     * List all deployments for a project
     */
    listDeployments(projectName: string, limit?: number): Promise<DeploymentInfo[]>;
}

/**
 * Base adapter with common functionality
 */
export abstract class BaseCloudAdapter implements ICloudDeployAdapter {
    abstract readonly provider: CloudProvider;

    abstract isConfigured(): boolean;
    abstract validateCredentials(): Promise<boolean>;
    abstract deploy(config: CloudDeployConfig): Promise<CloudDeploymentResult>;
    abstract getStatus(deploymentId: string): Promise<DeploymentInfo | null>;
    abstract getLogs(deploymentId: string): Promise<string[]>;
    abstract cancel(deploymentId: string): Promise<boolean>;
    abstract remove(deploymentId: string): Promise<boolean>;
    abstract listDeployments(projectName: string, limit?: number): Promise<DeploymentInfo[]>;

    /**
     * Create error result
     */
    protected createErrorResult(error: string): CloudDeploymentResult {
        return {
            success: false,
            provider: this.provider,
            deploymentId: '',
            status: 'failed',
            error,
        };
    }

    /**
     * Generate project name from workspace
     */
    protected sanitizeProjectName(name: string): string {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/--+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 50);
    }
}

/**
 * Cloud provider configuration from environment
 */
export interface CloudProviderCredentials {
    vercel?: {
        token: string;
        teamId?: string;
    };
    railway?: {
        token: string;
    };
    aws?: {
        accessKeyId: string;
        secretAccessKey: string;
        region: string;
    };
}

/**
 * Load credentials from environment
 */
export function loadCloudCredentials(): CloudProviderCredentials {
    const env = AdminConfig.getChildProcessEnv();
    return {
        vercel: env.VERCEL_TOKEN ? {
            token: env.VERCEL_TOKEN,
            teamId: env.VERCEL_TEAM_ID,
        } : undefined,
        railway: env.RAILWAY_TOKEN ? {
            token: env.RAILWAY_TOKEN,
        } : undefined,
        aws: env.AWS_ACCESS_KEY_ID ? {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY || '',
            region: env.AWS_REGION || 'us-east-1',
        } : undefined,
    };
}

/**
 * Get available providers based on configured credentials
 */
export function getAvailableProviders(): CloudProvider[] {
    const creds = loadCloudCredentials();
    const providers: CloudProvider[] = ['local']; // Local is always available

    if (creds.vercel?.token) providers.push('vercel');
    if (creds.railway?.token) providers.push('railway');
    if (creds.aws?.accessKeyId) providers.push('aws');

    return providers;
}
