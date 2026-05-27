import { RuntimeEnv } from './runtime-env';

export interface SelectOptions {
    filters?: Record<string, unknown>;
    orderBy?: string;
    ascending?: boolean;
    limit?: number;
    columns?: string;
}

function getSupabaseConfig(): { baseUrl: string; serviceKey: string } | null {
    const baseUrl = RuntimeEnv.get('CODESMITH_SUPABASE_URL')
        || RuntimeEnv.get('NEXT_PUBLIC_SUPABASE_URL')
        || RuntimeEnv.get('SUPABASE_URL')
        || RuntimeEnv.get('VITE_SUPABASE_URL');
    const serviceKey = RuntimeEnv.get('CODESMITH_SUPABASE_SERVICE_ROLE_KEY')
        || RuntimeEnv.get('SUPABASE_SERVICE_ROLE_KEY')
        || RuntimeEnv.get('CODESMITH_SUPABASE_SERVICE_KEY');

    if (!baseUrl || !serviceKey) {
        return null;
    }

    return {
        baseUrl: baseUrl.replace(/\/$/, ''),
        serviceKey
    };
}

function toSerializable(value: unknown): unknown {
    if (value instanceof Date) {
        return value.toISOString();
    }

    if (Array.isArray(value)) {
        return value.map(toSerializable);
    }

    if (value && typeof value === 'object') {
        const output: Record<string, unknown> = {};
        for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
            output[key] = toSerializable(nestedValue);
        }
        return output;
    }

    return value;
}

function createFilterParams(filters: Record<string, unknown>): URLSearchParams {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(filters)) {
        if (value === undefined) {
            continue;
        }

        if (value === null) {
            params.append(key, 'is.null');
            continue;
        }

        if (value instanceof Date) {
            params.append(key, `eq.${value.toISOString()}`);
            continue;
        }

        if (Array.isArray(value)) {
            const encoded = value.map((item) => JSON.stringify(item)).join(',');
            params.append(key, `in.(${encoded})`);
            continue;
        }

        params.append(key, `eq.${String(value)}`);
    }

    return params;
}

async function requestSupabase(table: string, init: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    filters?: Record<string, unknown>;
    orderBy?: string;
    ascending?: boolean;
    limit?: number;
    columns?: string;
    body?: unknown;
}): Promise<Response | null> {
    const config = getSupabaseConfig();
    if (!config) {
        return null;
    }

    const query = createFilterParams(init.filters || {});

    query.set('select', init.columns || '*');

    if (init.orderBy) {
        query.set('order', `${init.orderBy}.${init.ascending === false ? 'desc' : 'asc'}`);
    }

    if (init.limit && init.limit > 0) {
        query.set('limit', String(Math.floor(init.limit)));
    }

    const url = `${config.baseUrl}/rest/v1/${table}?${query.toString()}`;
    let response: Response;
    try {
        response = await fetch(url, {
            method: init.method,
            headers: {
                apikey: config.serviceKey,
                Authorization: `Bearer ${config.serviceKey}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation'
            },
            body: init.body !== undefined ? JSON.stringify(toSerializable(init.body)) : undefined
        });
    } catch {
        return null;
    }

    if (!response.ok) {
        return null;
    }

    return response;
}

export function hasSupabasePersistence(): boolean {
    return !!getSupabaseConfig();
}

export async function selectRows<T>(table: string, options: SelectOptions = {}): Promise<T[] | null> {
    const response = await requestSupabase(table, {
        method: 'GET',
        filters: options.filters,
        orderBy: options.orderBy,
        ascending: options.ascending,
        limit: options.limit,
        columns: options.columns
    });

    if (!response) {
        return null;
    }

    const payload = await response.json();
    return Array.isArray(payload) ? payload as T[] : [];
}

export async function insertRow<T>(table: string, row: Record<string, unknown>): Promise<T | null> {
    const response = await requestSupabase(table, {
        method: 'POST',
        body: row
    });

    if (!response) {
        return null;
    }

    const payload = await response.json();
    if (Array.isArray(payload)) {
        return (payload[0] || null) as T | null;
    }

    return payload as T;
}

export async function upsertRow<T>(table: string, row: Record<string, unknown>, onConflict?: string): Promise<T | null> {
    const config = getSupabaseConfig();
    if (!config) {
        return null;
    }

    const query = new URLSearchParams();
    query.set('select', '*');
    if (onConflict) {
        query.set('on_conflict', onConflict);
    }

    const response = await fetch(`${config.baseUrl}/rest/v1/${table}?${query.toString()}`, {
        method: 'POST',
        headers: {
            apikey: config.serviceKey,
            Authorization: `Bearer ${config.serviceKey}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify([toSerializable(row)])
    }).catch(() => null as Response | null);

    if (!response || !response.ok) {
        return null;
    }

    const payload = await response.json();
    return Array.isArray(payload) ? (payload[0] || null) as T | null : payload as T;
}

export async function updateRows<T>(
    table: string,
    filters: Record<string, unknown>,
    patch: Record<string, unknown>
): Promise<T[] | null> {
    const response = await requestSupabase(table, {
        method: 'PATCH',
        filters,
        body: patch
    });

    if (!response) {
        return null;
    }

    const payload = await response.json();
    return Array.isArray(payload) ? payload as T[] : [];
}
