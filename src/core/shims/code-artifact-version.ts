/**
 * CodeArtifactVersion shim with optional Supabase persistence.
 * Falls back to in-memory storage when Supabase is not configured.
 */

import { getSupabaseClient } from '../db/supabase';

export interface ICodeArtifactVersion {
    execution_id: string;
    workspace_id: string;
    user_id: string;
    agent_id: string | null;
    path: string;
    language: string;
    version: number;
    content: string;
    content_hash: string;
    size_bytes: number;
    diff_summary: {
        changed: boolean;
        lines_added: number;
        lines_removed: number;
    };
    created_at: Date;
    [key: string]: unknown;
}

const store: ICodeArtifactVersion[] = [];
const ARTIFACT_VERSION_TABLE = 'codesmith_artifact_versions';

function toDate(value: unknown): Date {
    if (value instanceof Date) {
        return value;
    }
    const parsed = new Date(String(value || Date.now()));
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function toSerializable(value: unknown): unknown {
    if (value === undefined) {
        return undefined;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Array.isArray(value)) {
        return value.map((item) => toSerializable(item));
    }
    if (value && typeof value === 'object') {
        const output: Record<string, unknown> = {};
        for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
            const serialized = toSerializable(nestedValue);
            if (serialized !== undefined) {
                output[key] = serialized;
            }
        }
        return output;
    }
    return value;
}

function normalizeArtifactVersion(raw: Partial<ICodeArtifactVersion>): ICodeArtifactVersion {
    const base = {
        execution_id: '',
        workspace_id: '',
        user_id: '',
        agent_id: null,
        path: '',
        language: '',
        version: 1,
        content: '',
        content_hash: '',
        size_bytes: 0,
        diff_summary: { changed: false, lines_added: 0, lines_removed: 0 },
        created_at: new Date(),
        ...raw
    };

    return {
        ...base,
        version: Number(base.version) || 1,
        size_bytes: Number(base.size_bytes) || 0,
        created_at: toDate(base.created_at),
        diff_summary: {
            changed: Boolean(base.diff_summary?.changed),
            lines_added: Number(base.diff_summary?.lines_added) || 0,
            lines_removed: Number(base.diff_summary?.lines_removed) || 0
        }
    };
}

function matchesQuery(doc: ICodeArtifactVersion, query: Record<string, unknown>): boolean {
    return Object.entries(query).every(([k, val]) => doc[k] === val);
}

function sortDocs(docs: ICodeArtifactVersion[], sortSpec?: Record<string, unknown>): ICodeArtifactVersion[] {
    if (!sortSpec || Object.keys(sortSpec).length === 0) {
        return docs;
    }

    const entries = Object.entries(sortSpec);
    return [...docs].sort((a, b) => {
        for (const [field, directionValue] of entries) {
            const direction = Number(directionValue) < 0 ? -1 : 1;
            const left = a[field];
            const right = b[field];

            if (left === right) {
                continue;
            }
            if (left === undefined || left === null) {
                return -1 * direction;
            }
            if (right === undefined || right === null) {
                return 1 * direction;
            }
            if (left < right) {
                return -1 * direction;
            }
            if (left > right) {
                return 1 * direction;
            }
        }
        return 0;
    });
}

function applyFilters(queryBuilder: any, filters: Record<string, unknown>): any {
    let query = queryBuilder;
    for (const [field, value] of Object.entries(filters)) {
        if (value === undefined) {
            continue;
        }
        if (value === null) {
            query = query.is(field, null);
            continue;
        }
        if (value instanceof Date) {
            query = query.eq(field, value.toISOString());
            continue;
        }
        if (Array.isArray(value)) {
            query = query.in(field, value.map((item) => item instanceof Date ? item.toISOString() : item));
            continue;
        }
        query = query.eq(field, value);
    }
    return query;
}

function applySort(queryBuilder: any, sortSpec?: Record<string, unknown>): any {
    if (!sortSpec || Object.keys(sortSpec).length === 0) {
        return queryBuilder;
    }

    let query = queryBuilder;
    for (const [field, directionValue] of Object.entries(sortSpec)) {
        query = query.order(field, { ascending: Number(directionValue) >= 0 });
    }
    return query;
}

function upsertStore(doc: ICodeArtifactVersion): ICodeArtifactVersion {
    const existingIndex = store.findIndex((entry) =>
        entry.execution_id === doc.execution_id
        && entry.path === doc.path
        && entry.version === doc.version
    );

    if (existingIndex >= 0) {
        store[existingIndex] = { ...store[existingIndex], ...doc };
        return store[existingIndex];
    }

    store.push(doc);
    return doc;
}

export const CodeArtifactVersion = {
    async create(data: Partial<ICodeArtifactVersion>): Promise<ICodeArtifactVersion> {
        const doc = normalizeArtifactVersion({
            ...data,
            created_at: data.created_at || new Date()
        });
        upsertStore(doc);

        const client = getSupabaseClient();
        if (client) {
            try {
                const payload = toSerializable(doc) as Record<string, unknown>;
                const { data: insertedRows, error } = await client
                    .from(ARTIFACT_VERSION_TABLE)
                    .insert(payload)
                    .select('*')
                    .limit(1);

                if (!error && insertedRows && insertedRows.length > 0) {
                    const persisted = normalizeArtifactVersion(insertedRows[0] as Partial<ICodeArtifactVersion>);
                    return upsertStore(persisted);
                }
            } catch {
                // Keep in-memory fallback document.
            }
        }

        return doc;
    },

    findOne(query: Record<string, unknown>) {
        let sortSpec: Record<string, unknown> | undefined;
        return {
            sort(s: Record<string, unknown>) {
                sortSpec = s;
                return this;
            },
            async exec(): Promise<ICodeArtifactVersion | null> {
                const client = getSupabaseClient();
                if (client) {
                    try {
                        let dbQuery = client.from(ARTIFACT_VERSION_TABLE).select('*');
                        dbQuery = applyFilters(dbQuery, query);
                        dbQuery = applySort(dbQuery, sortSpec);

                        const { data, error } = await dbQuery.limit(1);
                        if (!error && data) {
                            if (data.length === 0) {
                                return null;
                            }
                            const normalized = normalizeArtifactVersion(data[0] as Partial<ICodeArtifactVersion>);
                            return upsertStore(normalized);
                        }
                    } catch {
                        // Fall back to in-memory storage.
                    }
                }

                const matches = store.filter((doc) => matchesQuery(doc, query));
                const sorted = sortDocs(matches, sortSpec);
                return sorted[0] || null;
            },
        };
    },

    find(query: Record<string, unknown>) {
        let sortSpec: Record<string, unknown> | undefined;
        let limitValue: number | undefined;
        return {
            sort(s: Record<string, unknown>) {
                sortSpec = s;
                return this;
            },
            limit(n: number) {
                limitValue = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : undefined;
                return this;
            },
            async exec(): Promise<ICodeArtifactVersion[]> {
                const client = getSupabaseClient();
                if (client) {
                    try {
                        let dbQuery = client.from(ARTIFACT_VERSION_TABLE).select('*');
                        dbQuery = applyFilters(dbQuery, query);
                        dbQuery = applySort(dbQuery, sortSpec);
                        if (limitValue !== undefined) {
                            dbQuery = dbQuery.limit(limitValue);
                        }

                        const { data, error } = await dbQuery;
                        if (!error && data) {
                            return data.map((row) =>
                                upsertStore(normalizeArtifactVersion(row as Partial<ICodeArtifactVersion>))
                            );
                        }
                    } catch {
                        // Fall back to in-memory storage.
                    }
                }

                let results = store.filter((doc) => matchesQuery(doc, query));
                results = sortDocs(results, sortSpec);

                if (limitValue !== undefined) {
                    results = results.slice(0, limitValue);
                }

                return results;
            },
        };
    },
};
