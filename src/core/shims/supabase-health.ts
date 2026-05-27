/**
 * Lightweight health check for Supabase persistence.
 * Used to verify that the connection is live and the required tables exist.
 */

import { hasSupabasePersistence, selectRows } from './supabase-rest';

export type SupabaseHealthStatus = 'connected' | 'disconnected' | 'error';

export interface SupabaseHealthReport {
    status: SupabaseHealthStatus;
    configured: boolean;
    tables: Record<string, boolean>;
    latency_ms: number;
    error?: string;
}

const REQUIRED_TABLES = [
    'codesmith_events',
    'codesmith_deployments',
    'codesmith_build_artifacts',
    'codesmith_artifact_versions',
] as const;

/**
 * Checks whether Supabase is configured and reachable, and verifies
 * that all 4 required tables exist by issuing a minimal SELECT.
 */
export async function checkSupabaseHealth(): Promise<SupabaseHealthReport> {
    const configured = hasSupabasePersistence();

    if (!configured) {
        return {
            status: 'disconnected',
            configured: false,
            tables: Object.fromEntries(REQUIRED_TABLES.map((t) => [t, false])),
            latency_ms: 0,
        };
    }

    const start = Date.now();
    const tableResults: Record<string, boolean> = {};
    let hasError = false;
    let errorMessage: string | undefined;

    for (const table of REQUIRED_TABLES) {
        try {
            const rows = await selectRows(table, { limit: 1 });
            // selectRows returns null when Supabase is unreachable or the table doesn't exist
            tableResults[table] = rows !== null;

            if (rows === null) {
                hasError = true;
                errorMessage = errorMessage || `Table "${table}" is unreachable or missing`;
            }
        } catch (err: unknown) {
            tableResults[table] = false;
            hasError = true;
            errorMessage = err instanceof Error ? err.message : String(err);
        }
    }

    const latency = Date.now() - start;

    if (hasError) {
        return {
            status: 'error',
            configured: true,
            tables: tableResults,
            latency_ms: latency,
            error: errorMessage,
        };
    }

    return {
        status: 'connected',
        configured: true,
        tables: tableResults,
        latency_ms: latency,
    };
}

/**
 * One-line summary suitable for startup logs.
 */
export async function logSupabaseStatus(): Promise<void> {
    const report = await checkSupabaseHealth();

    if (report.status === 'connected') {
        const tableCount = Object.values(report.tables).filter(Boolean).length;
        console.log(
            `[supabase] Connected (${tableCount}/${REQUIRED_TABLES.length} tables, ${report.latency_ms}ms)`
        );
    } else if (report.status === 'disconnected') {
        console.log('[supabase] Not configured — using in-memory persistence');
    } else {
        console.warn(`[supabase] Error: ${report.error || 'unknown'} (${report.latency_ms}ms)`);
    }
}
