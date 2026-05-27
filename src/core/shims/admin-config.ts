/**
 * AdminConfig shim — replaces @core/config/AdminConfig.
 * Reads from config/settings.json and config/admin.env at startup.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve paths relative to the project root
function resolveProjectRoot(): string {
    // In Electron packaged app, use the app path
    try {
        // Check if we're in an Electron environment
        if (typeof process !== 'undefined' && (process as any).type === 'browser') {
            // Main process
            const { app } = require('electron');
            if (app && app.isPackaged) {
                return app.getAppPath();
            }
        }
    } catch {
        // Not in Electron, continue with default resolution
    }

    // Walk up from this file (src/core/shims/) to project root (3 levels up)
    const thisDir = typeof __dirname !== 'undefined'
        ? __dirname
        : path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(thisDir, '..', '..', '..');
}

function loadAdminEnv(): Record<string, string> {
    const envPath = path.join(resolveProjectRoot(), 'config', 'admin.env');
    const result: Record<string, string> = {};
    try {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx < 0) continue;
            const key = trimmed.slice(0, eqIdx).trim();
            const value = trimmed.slice(eqIdx + 1).trim();
            result[key] = value;
        }
    } catch { /* admin.env may not exist */ }
    return result;
}

function loadSettingsJson(): Record<string, unknown> {
    const settingsPath = path.join(resolveProjectRoot(), 'config', 'settings.json');
    try {
        const raw = fs.readFileSync(settingsPath, 'utf8');
        return JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return {};
    }
}

const adminEnv = loadAdminEnv();
const settingsJson = loadSettingsJson();
const adminBlock = (settingsJson.admin || {}) as Record<string, unknown>;

export class AdminConfig {
    /** OpenRouter API key from admin.env */
    static getOpenRouterApiKey(throwIfMissing: boolean = true): string {
        const key = adminEnv.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '';
        if (!key && throwIfMissing) {
            throw new Error('OPENROUTER_API_KEY is not set in config/admin.env');
        }
        return key;
    }

    static getOpenRouterBaseUrl(): string {
        return adminEnv.OPENROUTER_BASE_URL || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    }

    /** Workspace root directory */
    static getWorkspaceRoot(): string {
        return adminEnv.WORKSPACE_ROOT || process.env.WORKSPACE_ROOT || path.join(resolveProjectRoot(), 'workspaces');
    }

    /** Full admin block from settings.json */
    static getSnapshot(): Record<string, unknown> {
        return { ...adminBlock };
    }

    /** Cost limits from settings.json */
    static getCostLimits(_workspace_id?: string): {
        max_cost_per_model_call: number;
        max_cost_per_execution: number;
        max_cost_per_workspace_daily: number;
    } {
        const limits = (adminBlock.cost_limits || {}) as Record<string, number>;
        return {
            max_cost_per_model_call: limits.max_cost_per_model_call || 50,
            max_cost_per_execution: limits.max_cost_per_execution || 500,
            max_cost_per_workspace_daily: limits.max_cost_per_workspace_daily || 5000,
        };
    }

    /** Preview is disabled — Bolt uses WebContainers for previewing */
    static isPreviewEnabled(_workspace_id?: string): boolean {
        return false;
    }

    /** Deployment is disabled — Bolt manages deployment natively */
    static isDeploymentEnabled(_workspace_id?: string): boolean {
        return false;
    }

    /** Workspace cleanup policy */
    static getWorkspaceCleanupPolicy(): { enabled: boolean; delay_seconds: number } {
        return {
            enabled: adminEnv.WORKSPACE_CLEANUP_ON_COMPLETION === 'true',
            delay_seconds: parseInt(adminEnv.WORKSPACE_CLEANUP_DELAY_SECONDS || '0', 10),
        };
    }

    /** Command execution policy */
    static getCommandPolicy(): {
        allowlist: string[];
        timeout_ms: number;
        max_output_bytes: number;
        cpu_limit_seconds: number;
        memory_limit_mb: number;
    } {
        return {
            allowlist: [
                // Node / package managers
                'npm', 'npx', 'pnpm', 'yarn', 'bun', 'bunx',
                // Node / TypeScript runtime
                'node', 'tsc', 'tsx', 'ts-node',
                // Shells & command execution
                'bash', 'sh', 'zsh',
                // Python
                'python', 'python3', 'pip', 'pip3', 'pipenv', 'poetry', 'uv',
                // Ruby
                'ruby', 'gem', 'bundle',
                // Go
                'go',
                // Rust / Cargo
                'cargo', 'rustc',
                // C/C++ / build
                'make', 'cmake', 'gcc', 'g++', 'clang',
                // Java
                'java', 'javac', 'mvn', 'gradle',
                // Git version control
                'git',
                // HTTP clients
                'curl', 'wget',
                // File / directory utilities
                'ls', 'dir', 'echo', 'cat', 'tac', 'head', 'tail',
                'mkdir', 'rmdir', 'rm', 'cp', 'mv', 'touch', 'ln',
                'find', 'locate', 'which', 'whereis', 'type',
                // Text processing
                'grep', 'egrep', 'fgrep', 'rg',
                'sed', 'awk', 'cut', 'tr', 'sort', 'uniq', 'wc',
                'xargs', 'jq', 'yq',
                // Archive / compression
                'tar', 'zip', 'unzip', 'gzip', 'gunzip', 'bzip2', 'bunzip2', 'xz',
                // File permissions / metadata
                'chmod', 'chown', 'stat', 'du', 'df',
                // Process / environment
                'env', 'printenv', 'export', 'set',
                'ps', 'kill', 'sleep', 'date', 'time', 'timeout',
                // Database CLIs
                'psql', 'mysql', 'sqlite3', 'mongosh',
                // Cloud / infra CLIs
                'aws', 'gcloud', 'az', 'kubectl', 'helm', 'terraform', 'docker',
                // Code quality
                'eslint', 'prettier', 'biome',
                // Misc utilities
                'test', 'true', 'false', 'diff', 'patch',
                'base64', 'md5sum', 'sha256sum', 'openssl',
            ],
            timeout_ms: parseInt(adminEnv.COMMAND_TIMEOUT_MS || '1200000', 10), // 20 min default
            max_output_bytes: parseInt(adminEnv.COMMAND_MAX_OUTPUT_BYTES || '1000000', 10),
            cpu_limit_seconds: parseInt(adminEnv.COMMAND_CPU_LIMIT_SECONDS || '0', 10),
            memory_limit_mb: parseInt(adminEnv.COMMAND_MEMORY_LIMIT_MB || '0', 10),
        };
    }

    /** Child process env — pass through current env */
    static getChildProcessEnv(options?: { include_openrouter_key?: boolean, extra?: Record<string, string> }): Record<string, string> {
        const env = { ...process.env } as Record<string, string>;
        if (options?.extra) {
            Object.assign(env, options.extra);
        }
        if (options?.include_openrouter_key === false) {
            delete env.OPENROUTER_API_KEY;
        }
        return env;
    }

    /** Preview policy */
    static getPreviewPolicy(): {
        healthcheck_path: string;
        ready_timeout_ms: number;
        idle_ttl_seconds: number;
    } {
        return {
            healthcheck_path: adminEnv.PREVIEW_HEALTHCHECK_PATH || '/',
            ready_timeout_ms: parseInt(adminEnv.PREVIEW_READY_TIMEOUT_MS || '60000', 10),
            idle_ttl_seconds: parseInt(adminEnv.PREVIEW_IDLE_TTL_SECONDS || '900', 10),
        };
    }

    /** Domain/SSL config */
    static getDomainSslConfig(_workspace_id?: string): {
        base_domain: string;
        ssl_enabled: boolean;
        allow_custom_domains: boolean;
        auto_subdomain_prefix: string;
        public_gateway_base_url: string;
        default_scheme: string;
    } {
        const cfg = (adminBlock.domain_ssl || {}) as Record<string, unknown>;
        return {
            base_domain: String(cfg.base_domain || 'localhost'),
            ssl_enabled: cfg.ssl_enabled === true,
            allow_custom_domains: cfg.allow_custom_domains === true,
            auto_subdomain_prefix: String(cfg.auto_subdomain_prefix || 'app'),
            public_gateway_base_url: String(cfg.public_gateway_base_url || ''),
            default_scheme: String(cfg.default_scheme || 'https'),
        };
    }

    /** Deployment policy */
    static getDeploymentPolicy(_workspace_id?: string): { scheme: string; runtime: string } {
        return {
            scheme: adminEnv.DEPLOY_DEFAULT_SCHEME || 'https',
            runtime: adminEnv.DEPLOY_RUNTIME || 'local',
        };
    }

    /** Agent models from settings.json */
    static getCodeSmithAgentModels(): Record<string, string> {
        return (adminBlock.codesmith_agent_models || {}) as Record<string, string>;
    }

    /** Agent token caps from settings.json */
    static getCodeSmithAgentTokenCaps(): Record<string, number> {
        return (adminBlock.codesmith_agent_token_caps || {}) as Record<string, number>;
    }

    /** Agent credit multipliers */
    static getCodeSmithAgentCreditMultipliers(): Record<string, number> {
        return (adminBlock.codesmith_agent_credit_multipliers || {}) as Record<string, number>;
    }

    /** Agent enabled flags */
    static getCodeSmithAgentEnabled(): Record<string, boolean> {
        return (adminBlock.codesmith_agent_enabled || {}) as Record<string, boolean>;
    }

    /** Agent allowed tools */
    static getCodeSmithAgentAllowedTools(): Record<string, string[]> {
        return (adminBlock.codesmith_agent_allowed_tools || {}) as Record<string, string[]>;
    }

    /** Mode-specific agent model bindings */
    static getModeAgentModelBindings(): Record<string, Record<string, string>> {
        return (adminBlock.mode_agent_model_bindings || {}) as Record<string, Record<string, string>>;
    }

    /** Mode-specific token limits */
    static getModeAgentTokenLimits(): Record<string, Record<string, number>> {
        return (adminBlock.mode_agent_token_limits || {}) as Record<string, Record<string, number>>;
    }

    /** Mode pricing from settings.json (credits per CodeSmith build) */
    static getModePricing(): Record<string, number> {
        return (adminBlock.mode_pricing || {}) as Record<string, number>;
    }

    /** Billing feature flags from admin.env */
    static getBillingConfig(): {
        enabled: boolean;
        idempotencyTtlSeconds: number;
        logAllEvents: boolean;
        rateLimitPerMinute: number;
        webhookRateLimit: number;
        creditToUsdRate: number;
        minCreditPurchase: number;
        maxCreditPurchase: number;
    } {
        return {
            enabled: adminEnv.BILLING_ENABLED === 'true',
            idempotencyTtlSeconds: parseInt(adminEnv.BILLING_IDEMPOTENCY_TTL_SECONDS || '86400', 10),
            logAllEvents: adminEnv.BILLING_LOG_ALL_EVENTS === 'true',
            rateLimitPerMinute: parseInt(adminEnv.BILLING_RATE_LIMIT_PER_MINUTE || '20', 10),
            webhookRateLimit: parseInt(adminEnv.BILLING_WEBHOOK_RATE_LIMIT || '50', 10),
            creditToUsdRate: parseFloat(adminEnv.CREDIT_TO_USD_RATE || '1'),
            minCreditPurchase: parseInt(adminEnv.MIN_CREDIT_PURCHASE || '1', 10),
            maxCreditPurchase: parseInt(adminEnv.MAX_CREDIT_PURCHASE || '10000', 10),
        };
    }

    /** Stripe config from admin.env — null if keys are not set */
    static getStripeConfig(): {
        publishableKey: string;
        secretKey: string;
        webhookSecret: string;
        successUrl: string;
        cancelUrl: string;
    } | null {
        const secretKey = adminEnv.STRIPE_SECRET_KEY || '';
        if (!secretKey || adminEnv.STRIPE_ENABLED !== 'true') {
            return null;
        }
        return {
            publishableKey: adminEnv.STRIPE_PUBLISHABLE_KEY || '',
            secretKey,
            webhookSecret: adminEnv.STRIPE_WEBHOOK_SECRET || '',
            successUrl: adminEnv.STRIPE_SUCCESS_URL || '/billing/success',
            cancelUrl: adminEnv.STRIPE_CANCEL_URL || '/billing/cancel',
        };
    }

    /** Razorpay config from admin.env — null if keys are not set */
    static getRazorpayConfig(): {
        keyId: string;
        keySecret: string;
        webhookSecret: string;
    } | null {
        const keyId = adminEnv.RAZORPAY_KEY_ID || '';
        const keySecret = adminEnv.RAZORPAY_KEY_SECRET || '';
        if (!keyId || !keySecret || adminEnv.RAZORPAY_ENABLED !== 'true') {
            return null;
        }
        return {
            keyId,
            keySecret,
            webhookSecret: adminEnv.RAZORPAY_WEBHOOK_SECRET || '',
        };
    }
}
