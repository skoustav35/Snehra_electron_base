import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { RuntimeEnv } from '../shims/runtime-env';

interface SupabaseConfig {
    url: string;
    serviceRoleKey: string;
}

let cachedClient: SupabaseClient | null = null;
let cachedKey: string | null = null;
let localClient: any = null;

function readEnv(name: string): string | undefined {
    const raw = RuntimeEnv.get(name);
    if (!raw) {
        return undefined;
    }

    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Check if we're running inside Electron.
 */
function isElectron(): boolean {
    return typeof window !== 'undefined' && !!(window as any).localDb;
}

export function getSupabaseConfig(): SupabaseConfig | null {
    const url = readEnv('CODESMITH_SUPABASE_URL')
        || readEnv('NEXT_PUBLIC_SUPABASE_URL')
        || readEnv('SUPABASE_URL')
        || readEnv('VITE_SUPABASE_URL');
    const serviceRoleKey = readEnv('CODESMITH_SUPABASE_SERVICE_ROLE_KEY')
        || readEnv('SUPABASE_SERVICE_ROLE_KEY')
        || readEnv('CODESMITH_SUPABASE_SERVICE_KEY');

    if (!url || !serviceRoleKey) {
        return null;
    }

    return {
        url: url.replace(/\/$/, ''),
        serviceRoleKey,
    };
}

export function hasSupabaseConfig(): boolean {
    // In Electron, we always have a "database" available (local SQLite)
    if (isElectron()) {
        return true;
    }
    return getSupabaseConfig() !== null;
}

export function getSupabaseClient(): SupabaseClient | null {
    const config = getSupabaseConfig();

    // If Supabase is configured, use it (even in Electron)
    if (config) {
        const nextKey = `${config.url}|${config.serviceRoleKey}`;
        if (cachedClient && cachedKey === nextKey) {
            return cachedClient;
        }

        cachedClient = createClient(config.url, config.serviceRoleKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        });
        cachedKey = nextKey;

        return cachedClient;
    }

    // Fallback: In Electron, use the local SQLite adapter
    if (isElectron()) {
        if (!localClient) {
            // Dynamic import to avoid loading SQLite adapter when not needed
            try {
                const { createLocalClient } = require('../db/local-sqlite');
                localClient = createLocalClient();
            } catch (err) {
                console.warn('[DB] Failed to initialize local SQLite client:', err);
                return null;
            }
        }
        return localClient as any;
    }

    return null;
}

