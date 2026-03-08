/**
 * Cloud Adapter Factory
 * 
 * Factory for creating and managing cloud provider adapters.
 * Provides a unified interface to deploy to any supported provider.
 */

import {
    CloudProvider,
    CloudDeployConfig,
    CloudDeploymentResult,
    ICloudDeployAdapter,
    getAvailableProviders,
} from './cloud-deploy-adapter';
import { VercelAdapter } from './adapters/vercel-adapter';
import { RailwayAdapter } from './adapters/railway-adapter';
import { AWSAdapter } from './adapters/aws-adapter';
import { logger } from '../shims/logger';

// Adapter registry
const adapters: Map<CloudProvider, ICloudDeployAdapter> = new Map();

/**
 * Get an adapter instance for the specified provider
 */
export function getCloudAdapter(provider: CloudProvider): ICloudDeployAdapter | null {
    // Check cache
    if (adapters.has(provider)) {
        return adapters.get(provider)!;
    }

    // Create new adapter
    let adapter: ICloudDeployAdapter | null = null;

    switch (provider) {
        case 'vercel':
            adapter = new VercelAdapter();
            break;
        case 'railway':
            adapter = new RailwayAdapter();
            break;
        case 'aws':
            adapter = new AWSAdapter();
            break;
        default:
            return null;
    }

    // Cache if configured
    if (adapter.isConfigured()) {
        adapters.set(provider, adapter);
        return adapter;
    }

    return null;
}

/**
 * Get the best available adapter for deployment
 * Priority: Vercel > Railway > AWS
 */
export function getBestAvailableAdapter(): ICloudDeployAdapter | null {
    const available = getAvailableProviders();

    // Priority order
    const priority: CloudProvider[] = ['vercel', 'railway', 'aws'];

    for (const provider of priority) {
        if (available.includes(provider)) {
            const adapter = getCloudAdapter(provider);
            if (adapter) return adapter;
        }
    }

    return null;
}

/**
 * Deploy to a specific cloud provider
 */
export async function deployToCloud(
    config: CloudDeployConfig
): Promise<CloudDeploymentResult> {
    const adapter = getCloudAdapter(config.provider);

    if (!adapter) {
        return {
            success: false,
            provider: config.provider,
            deploymentId: '',
            status: 'failed',
            error: `Provider '${config.provider}' is not configured. Check environment variables.`,
        };
    }

    logger.info('[CloudAdapterFactory] Deploying to provider', {
        provider: config.provider,
        project: config.projectName,
    });

    return adapter.deploy(config);
}

/**
 * Deploy to the best available provider
 */
export async function deployToAnyCloud(
    config: Omit<CloudDeployConfig, 'provider'>
): Promise<CloudDeploymentResult> {
    const adapter = getBestAvailableAdapter();

    if (!adapter) {
        return {
            success: false,
            provider: 'local',
            deploymentId: '',
            status: 'failed',
            error: 'No cloud providers configured. Set VERCEL_TOKEN, RAILWAY_TOKEN, or AWS credentials.',
        };
    }

    logger.info('[CloudAdapterFactory] Auto-selected provider', {
        provider: adapter.provider,
        project: config.projectName,
    });

    return adapter.deploy({ ...config, provider: adapter.provider });
}

/**
 * Check which providers are available
 */
export function listAvailableProviders(): { provider: CloudProvider; configured: boolean }[] {
    const providers: CloudProvider[] = ['vercel', 'railway', 'aws'];

    return providers.map(provider => ({
        provider,
        configured: !!getCloudAdapter(provider),
    }));
}

/**
 * Validate all configured providers
 */
export async function validateAllProviders(): Promise<{
    provider: CloudProvider;
    valid: boolean;
    error?: string;
}[]> {
    const results: { provider: CloudProvider; valid: boolean; error?: string }[] = [];

    for (const { provider, configured } of listAvailableProviders()) {
        if (!configured) {
            results.push({ provider, valid: false, error: 'Not configured' });
            continue;
        }

        const adapter = getCloudAdapter(provider)!;
        try {
            const valid = await adapter.validateCredentials();
            results.push({ provider, valid, error: valid ? undefined : 'Invalid credentials' });
        } catch (error) {
            results.push({
                provider,
                valid: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    return results;
}
