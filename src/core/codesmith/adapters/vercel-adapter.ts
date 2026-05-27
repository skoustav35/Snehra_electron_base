/**
 * Vercel Cloud Deployment Adapter
 * 
 * Deploys applications to Vercel via their REST API:
 * - Auto-creates projects
 * - Uploads source files
 * - Monitors build/deployment status
 * - Returns public .vercel.app URLs
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../../shims/logger';
import { BaseCloudAdapter, loadCloudCredentials } from '../cloud-deploy-adapter';
import type {
    CloudDeployConfig,
    CloudDeploymentResult,
    DeploymentInfo,
    DeploymentStatus,
} from '../cloud-deploy-adapter';

interface VercelFile {
    file: string;
    data: string;
    encoding?: 'base64' | 'utf-8';
}

interface VercelDeploymentResponse {
    id: string;
    url: string;
    name: string;
    meta?: Record<string, unknown>;
    ready?: boolean;
    readyState?: 'QUEUED' | 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'READY' | 'CANCELED';
    createdAt?: number;
    buildingAt?: number;
    alias?: string[];
    error?: {
        code: string;
        message: string;
    };
}

interface VercelProjectResponse {
    id: string;
    name: string;
    framework?: string;
}

interface VercelDeploymentPayload {
    name: string;
    files: VercelFile[];
    project: string;
    target: 'production';
    projectSettings: Record<string, unknown>;
    env?: Record<string, string>;
}

const VERCEL_API_BASE = 'https://api.vercel.com';

// Files/directories to exclude from upload
const EXCLUDE_PATTERNS = [
    'node_modules',
    '.git',
    '.next',
    'dist',
    'build',
    '.vercel',
    '.env.local',
    '.env*.local',
    '*.log',
];

// Framework to Vercel preset mapping
const FRAMEWORK_PRESETS: Record<string, string> = {
    'nextjs': 'nextjs',
    'react': 'create-react-app',
    'vue': 'vue',
    'nodejs': 'other',
    'python-fastapi': 'other',
    'unknown': 'other',
};

export class VercelAdapter extends BaseCloudAdapter {
    readonly provider = 'vercel' as const;
    private token: string | null = null;
    private teamId: string | null = null;

    constructor() {
        super();
        const creds = loadCloudCredentials();
        this.token = creds.vercel?.token || null;
        this.teamId = creds.vercel?.teamId || null;
    }

    isConfigured(): boolean {
        return !!this.token;
    }

    async validateCredentials(): Promise<boolean> {
        if (!this.token) return false;

        try {
            const response = await fetch(`${VERCEL_API_BASE}/v2/user`, {
                headers: this.getHeaders(),
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    async deploy(config: CloudDeployConfig): Promise<CloudDeploymentResult> {
        if (!this.isConfigured()) {
            return this.createErrorResult('Vercel token not configured. Set VERCEL_TOKEN environment variable.');
        }

        const projectName = this.sanitizeProjectName(config.projectName);

        logger.info('[VercelAdapter] Starting deployment', { projectName, framework: config.framework });

        try {
            // Step 1: Ensure project exists
            const project = await this.ensureProject(projectName, config);

            // Step 2: Collect files to upload
            const files = await this.collectFiles(config.workspaceRoot);

            if (files.length === 0) {
                return this.createErrorResult('No files found to deploy');
            }

            logger.info('[VercelAdapter] Uploading files', { fileCount: files.length });

            // Step 3: Create deployment
            const deploymentPayload: VercelDeploymentPayload = {
                name: projectName,
                files,
                project: project.id,
                target: 'production',
                projectSettings: {
                    framework: FRAMEWORK_PRESETS[config.framework] || 'other',
                    ...config.vercel,
                },
            };

            // Add environment variables
            if (config.environment && Object.keys(config.environment).length > 0) {
                deploymentPayload.env = config.environment;
            }

            const deployResponse = await fetch(`${VERCEL_API_BASE}/v13/deployments${this.getTeamQuery()}`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(deploymentPayload),
            });

            if (!deployResponse.ok) {
                const errorData = await deployResponse.json() as { error?: { message?: string } };
                return this.createErrorResult(
                    `Deployment failed: ${errorData.error?.message || JSON.stringify(errorData)}`
                );
            }

            const deployment = await deployResponse.json() as VercelDeploymentResponse;

            logger.info('[VercelAdapter] Deployment created', {
                deploymentId: deployment.id,
                url: deployment.url,
            });

            // Step 4: Wait for deployment to be ready (with timeout)
            const finalStatus = await this.waitForDeployment(deployment.id, 300000); // 5 min timeout

            return {
                success: finalStatus.status === 'ready',
                provider: 'vercel',
                deploymentId: deployment.id,
                status: finalStatus.status,
                url: finalStatus.url ? `https://${finalStatus.url}` : undefined,
                error: finalStatus.error,
                metadata: {
                    projectId: project.id,
                    createdAt: new Date(deployment.createdAt || Date.now()),
                },
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error('[VercelAdapter] Deployment error', { error: message });
            return this.createErrorResult(message);
        }
    }

    async getStatus(deploymentId: string): Promise<DeploymentInfo | null> {
        if (!this.isConfigured()) return null;

        try {
            const response = await fetch(
                `${VERCEL_API_BASE}/v13/deployments/${deploymentId}${this.getTeamQuery()}`,
                { headers: this.getHeaders() }
            );

            if (!response.ok) return null;

            const data = await response.json() as VercelDeploymentResponse;

            return {
                deploymentId: data.id,
                status: this.mapVercelStatus(data.readyState),
                url: data.url ? `https://${data.url}` : undefined,
                createdAt: new Date(data.createdAt || Date.now()),
                updatedAt: new Date(),
                error: data.error?.message,
            };
        } catch {
            return null;
        }
    }

    async getLogs(deploymentId: string): Promise<string[]> {
        if (!this.isConfigured()) return [];

        try {
            const response = await fetch(
                `${VERCEL_API_BASE}/v2/deployments/${deploymentId}/events${this.getTeamQuery()}`,
                { headers: this.getHeaders() }
            );

            if (!response.ok) return [];

            const events = await response.json() as Array<{ text?: string; payload?: { text?: string } }>;
            return events.map((e) => e.text || e.payload?.text || JSON.stringify(e));
        } catch {
            return [];
        }
    }

    async cancel(deploymentId: string): Promise<boolean> {
        if (!this.isConfigured()) return false;

        try {
            const response = await fetch(
                `${VERCEL_API_BASE}/v12/deployments/${deploymentId}/cancel${this.getTeamQuery()}`,
                {
                    method: 'PATCH',
                    headers: this.getHeaders(),
                }
            );
            return response.ok;
        } catch {
            return false;
        }
    }

    async remove(deploymentId: string): Promise<boolean> {
        if (!this.isConfigured()) return false;

        try {
            const response = await fetch(
                `${VERCEL_API_BASE}/v13/deployments/${deploymentId}${this.getTeamQuery()}`,
                {
                    method: 'DELETE',
                    headers: this.getHeaders(),
                }
            );
            return response.ok;
        } catch {
            return false;
        }
    }

    async listDeployments(projectName: string, limit: number = 10): Promise<DeploymentInfo[]> {
        if (!this.isConfigured()) return [];

        try {
            const response = await fetch(
                `${VERCEL_API_BASE}/v6/deployments?project=${projectName}&limit=${limit}${this.getTeamQuery('&')}`,
                { headers: this.getHeaders() }
            );

            if (!response.ok) return [];

            const data = await response.json() as { deployments?: Array<{ uid: string; readyState: string; url?: string; created: number }> };
            return (data.deployments || []).map((d) => ({
                deploymentId: d.uid,
                status: this.mapVercelStatus(d.readyState),
                url: d.url ? `https://${d.url}` : undefined,
                createdAt: new Date(d.created),
                updatedAt: new Date(d.created),
            }));
        } catch {
            return [];
        }
    }

    // Private helpers

    private getHeaders(): Record<string, string> {
        return {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
        };
    }

    private getTeamQuery(prefix: string = '?'): string {
        return this.teamId ? `${prefix}teamId=${this.teamId}` : '';
    }

    private async ensureProject(
        projectName: string,
        config: CloudDeployConfig
    ): Promise<VercelProjectResponse> {
        // Check if project exists
        const checkResponse = await fetch(
            `${VERCEL_API_BASE}/v9/projects/${projectName}${this.getTeamQuery()}`,
            { headers: this.getHeaders() }
        );

        if (checkResponse.ok) {
            return checkResponse.json() as Promise<VercelProjectResponse>;
        }

        // Create new project
        const createResponse = await fetch(
            `${VERCEL_API_BASE}/v9/projects${this.getTeamQuery()}`,
            {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    name: projectName,
                    framework: FRAMEWORK_PRESETS[config.framework] || 'other',
                }),
            }
        );

        if (!createResponse.ok) {
            const error = await createResponse.json() as { error?: { message?: string } };
            throw new Error(`Failed to create project: ${error.error?.message || 'Unknown error'}`);
        }

        return createResponse.json() as Promise<VercelProjectResponse>;
    }

    private async collectFiles(workspaceRoot: string): Promise<VercelFile[]> {
        const files: VercelFile[] = [];
        await this.walkDirectory(workspaceRoot, workspaceRoot, files);
        return files;
    }

    private async walkDirectory(
        baseDir: string,
        currentDir: string,
        files: VercelFile[]
    ): Promise<void> {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

            // Check exclusions
            if (this.shouldExclude(relativePath, entry.name)) {
                continue;
            }

            if (entry.isDirectory()) {
                await this.walkDirectory(baseDir, fullPath, files);
            } else if (entry.isFile()) {
                try {
                    const content = fs.readFileSync(fullPath);
                    const isBinary = this.isBinaryFile(entry.name);

                    files.push({
                        file: relativePath,
                        data: content.toString(isBinary ? 'base64' : 'utf-8'),
                        encoding: isBinary ? 'base64' : 'utf-8',
                    });
                } catch (e) {
                    // Skip files we can't read
                    logger.warn('[VercelAdapter] Could not read file', { file: relativePath });
                }
            }
        }
    }

    private shouldExclude(relativePath: string, fileName: string): boolean {
        for (const pattern of EXCLUDE_PATTERNS) {
            if (relativePath.startsWith(pattern) || fileName === pattern) {
                return true;
            }
            if (pattern.includes('*')) {
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                if (regex.test(fileName)) {
                    return true;
                }
            }
        }
        return false;
    }

    private isBinaryFile(fileName: string): boolean {
        const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.pdf'];
        const ext = path.extname(fileName).toLowerCase();
        return binaryExtensions.includes(ext);
    }

    private async waitForDeployment(
        deploymentId: string,
        timeoutMs: number
    ): Promise<{ status: DeploymentStatus; url?: string; error?: string }> {
        const startTime = Date.now();
        const pollInterval = 3000; // 3 seconds

        while (Date.now() - startTime < timeoutMs) {
            const status = await this.getStatus(deploymentId);

            if (!status) {
                return { status: 'failed', error: 'Could not fetch deployment status' };
            }

            if (status.status === 'ready') {
                return { status: 'ready', url: status.url };
            }

            if (status.status === 'failed' || status.status === 'cancelled') {
                return { status: status.status, error: status.error };
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        return { status: 'failed', error: 'Deployment timed out' };
    }

    private mapVercelStatus(readyState?: string): DeploymentStatus {
        switch (readyState) {
            case 'QUEUED':
            case 'INITIALIZING':
                return 'pending';
            case 'BUILDING':
                return 'building';
            case 'READY':
                return 'ready';
            case 'ERROR':
                return 'failed';
            case 'CANCELED':
                return 'cancelled';
            default:
                return 'deploying';
        }
    }
}
