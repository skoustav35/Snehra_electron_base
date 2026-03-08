/**
 * CodeSmith model shims with optional Supabase persistence.
 * Falls back to in-memory stores when Supabase is not configured.
 */

import { getSupabaseClient } from '../db/supabase';

const DEPLOYMENT_TABLE = 'codesmith_deployments';
const BUILD_ARTIFACT_TABLE = 'codesmith_build_artifacts';

export interface IAgentConfig {
    agent_id: string;
    name?: string;
    description?: string;
    role?: string;
    system_prompt?: string;
    model_preference?: string;
    model_config?: {
        max_tokens?: number;
        temperature?: number;
        [key: string]: unknown;
    };
    capabilities?: string[];
    [key: string]: unknown;
}

// ----- Deployment model -----

export interface IDeployment {
    deployment_id: string;
    execution_id: string;
    workspace_id: string;
    user_id: string;
    agent_id?: string;
    status: string;
    deployment_target?: string;
    started_at?: Date;
    ended_at?: Date;
    deployed_urls?: string[];
    public_url?: string;
    custom_domain?: string | null;
    ssl_enabled?: boolean;
    deployment_version?: number;
    previous_deployment_id?: string | null;
    active?: boolean;
    rollback_available?: boolean;
    error_message?: string;
    logs_reference?: string;
    environment_hash?: string;
    agentcloud_commit?: string;
    save(): Promise<void>;
    [key: string]: unknown;
}

// ----- BuildArtifact model -----

export interface IBuildArtifact {
    execution_id: string;
    workspace_id?: string;
    user_id?: string;
    relative_path: string;
    absolute_path?: string;
    size_bytes?: number;
    sha256?: string;
    created_at?: Date;
    [key: string]: unknown;
}

type SortSpec = Record<string, unknown> | undefined;

function toDate(value: unknown): Date | undefined {
    if (value === null || value === undefined || value === '') {
        return undefined;
    }
    if (value instanceof Date) {
        return value;
    }
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
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

function matchesQuery<T extends Record<string, unknown>>(doc: T, query: Record<string, unknown>): boolean {
    return Object.entries(query).every(([key, value]) => doc[key] === value);
}

function sortDocs<T extends Record<string, unknown>>(docs: T[], sortSpec?: SortSpec): T[] {
    if (!sortSpec || Object.keys(sortSpec).length === 0) {
        return docs;
    }

    const sortEntries = Object.entries(sortSpec);
    return [...docs].sort((a, b) => {
        for (const [field, directionRaw] of sortEntries) {
            const direction = Number(directionRaw) < 0 ? -1 : 1;
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

function applySort(queryBuilder: any, sortSpec?: SortSpec): any {
    if (!sortSpec || Object.keys(sortSpec).length === 0) {
        return queryBuilder;
    }

    let query = queryBuilder;
    for (const [field, directionRaw] of Object.entries(sortSpec)) {
        query = query.order(field, { ascending: Number(directionRaw) >= 0 });
    }
    return query;
}

interface QueryLike<T> extends PromiseLike<T> {
    sort(sortSpec: Record<string, unknown>): QueryLike<T>;
    limit(limit: number): QueryLike<T>;
    exec(): Promise<T>;
    catch(onrejected?: ((reason: unknown) => unknown) | null): Promise<T>;
    finally(onfinally?: (() => void) | null): Promise<T>;
}

function createPromiseLikeQuery<T>(
    executor: () => Promise<T>,
    controls?: {
        setSort?: (sortSpec: Record<string, unknown>) => void;
        setLimit?: (limit: number) => void;
    }
): QueryLike<T> {
    const query: QueryLike<T> = {
        sort(sortSpec: Record<string, unknown>) {
            controls?.setSort?.(sortSpec);
            return query;
        },
        limit(limit: number) {
            controls?.setLimit?.(limit);
            return query;
        },
        exec: executor,
        then(onfulfilled?: ((value: T) => unknown) | null, onrejected?: ((reason: unknown) => unknown) | null) {
            return executor().then(onfulfilled as never, onrejected as never);
        },
        catch(onrejected?: ((reason: unknown) => unknown) | null) {
            return executor().catch(onrejected as never);
        },
        finally(onfinally?: (() => void) | null) {
            return executor().finally(onfinally as never);
        }
    };

    return query;
}

const deploymentStore: IDeployment[] = [];
const buildArtifactStore: IBuildArtifact[] = [];

function mergeDeployment(target: IDeployment, source: Partial<IDeployment>): void {
    const saveFn = target.save;
    Object.assign(target, source);
    target.save = saveFn;
}

function upsertDeploymentStore(doc: IDeployment): IDeployment {
    const existing = deploymentStore.find((entry) => entry.deployment_id === doc.deployment_id);
    if (existing) {
        mergeDeployment(existing, doc);
        return existing;
    }
    deploymentStore.push(doc);
    return doc;
}

function upsertBuildArtifactStore(doc: IBuildArtifact): IBuildArtifact {
    const existingIndex = buildArtifactStore.findIndex(
        (entry) => entry.execution_id === doc.execution_id && entry.relative_path === doc.relative_path
    );
    if (existingIndex >= 0) {
        buildArtifactStore[existingIndex] = { ...buildArtifactStore[existingIndex], ...doc };
        return buildArtifactStore[existingIndex];
    }
    buildArtifactStore.push(doc);
    return doc;
}

function serializeDeployment(doc: Partial<IDeployment>): Record<string, unknown> {
    const { save: _save, ...plain } = doc;
    return (toSerializable(plain) as Record<string, unknown>) || {};
}

function serializeBuildArtifact(doc: Partial<IBuildArtifact>): Record<string, unknown> {
    return (toSerializable(doc) as Record<string, unknown>) || {};
}

function normalizeDeployment(raw: Partial<IDeployment>): IDeployment {
    const doc: IDeployment = {
        deployment_id: '',
        execution_id: '',
        workspace_id: '',
        user_id: '',
        status: 'pending',
        ...raw,
        started_at: toDate(raw.started_at),
        ended_at: toDate(raw.ended_at),
        save: async () => {
            if (!doc.deployment_id) {
                return;
            }

            upsertDeploymentStore(doc);
            const client = getSupabaseClient();
            if (!client) {
                return;
            }

            try {
                const { data, error } = await client
                    .from(DEPLOYMENT_TABLE)
                    .update(serializeDeployment(doc))
                    .eq('deployment_id', doc.deployment_id)
                    .select('*')
                    .limit(1);

                if (!error && data && data.length > 0) {
                    const persisted = normalizeDeployment(data[0] as Partial<IDeployment>);
                    mergeDeployment(doc, persisted);
                    upsertDeploymentStore(doc);
                }
            } catch {
                // Ignore persistence errors and keep in-memory state.
            }
        }
    };

    return doc;
}

function normalizeBuildArtifact(raw: Partial<IBuildArtifact>): IBuildArtifact {
    return {
        execution_id: '',
        relative_path: '',
        ...raw,
        created_at: toDate(raw.created_at)
    };
}

export const Deployment = {
    create(data: Partial<IDeployment>): IDeployment {
        const doc = normalizeDeployment(data);
        upsertDeploymentStore(doc);

        const client = getSupabaseClient();
        if (client && doc.deployment_id) {
            void (async () => {
                try {
                    const { data: persisted, error } = await client
                        .from(DEPLOYMENT_TABLE)
                        .upsert(serializeDeployment(doc), { onConflict: 'deployment_id' })
                        .select('*')
                        .limit(1);

                    if (!error && persisted && persisted.length > 0) {
                        const normalized = normalizeDeployment(persisted[0] as Partial<IDeployment>);
                        mergeDeployment(doc, normalized);
                        upsertDeploymentStore(doc);
                    }
                } catch {
                    // Ignore persistence errors and keep in-memory state.
                }
            })();
        }

        return doc;
    },

    findOne(query: Record<string, unknown>) {
        let sortSpec: SortSpec = undefined;

        return createPromiseLikeQuery<IDeployment | null>(
            async () => {
                const client = getSupabaseClient();
                if (client) {
                    try {
                        let dbQuery = client.from(DEPLOYMENT_TABLE).select('*');
                        dbQuery = applyFilters(dbQuery, query);
                        dbQuery = applySort(dbQuery, sortSpec);

                        const { data, error } = await dbQuery.limit(1);
                        if (!error && data) {
                            if (data.length === 0) {
                                return null;
                            }
                            const normalized = normalizeDeployment(data[0] as Partial<IDeployment>);
                            return upsertDeploymentStore(normalized);
                        }
                    } catch {
                        // Fall back to in-memory store.
                    }
                }

                const local = sortDocs(
                    deploymentStore.filter((doc) => matchesQuery(doc, query)),
                    sortSpec
                );
                return local[0] || null;
            },
            {
                setSort: (nextSort) => {
                    sortSpec = nextSort;
                }
            }
        );
    },

    findOneAndUpdate(query: Record<string, unknown>, update: Record<string, unknown>) {
        const setData = (update.$set as Record<string, unknown>) || update;

        return createPromiseLikeQuery<IDeployment | null>(async () => {
            const localMatch = deploymentStore.find((doc) => matchesQuery(doc, query));
            if (localMatch) {
                mergeDeployment(localMatch, setData as Partial<IDeployment>);
            }

            const client = getSupabaseClient();
            if (client) {
                try {
                    let dbQuery = client
                        .from(DEPLOYMENT_TABLE)
                        .update(serializeDeployment(setData as Partial<IDeployment>))
                        .select('*');
                    dbQuery = applyFilters(dbQuery, query);

                    const { data: updatedRows, error: updateError } = await dbQuery;
                    if (!updateError && updatedRows && updatedRows.length > 0) {
                        const normalized = normalizeDeployment(updatedRows[0] as Partial<IDeployment>);
                        return upsertDeploymentStore(normalized);
                    }

                    const patchData: Record<string, unknown> = {
                        ...query,
                        ...setData
                    };
                    const deployment_id = typeof patchData.deployment_id === 'string' ? patchData.deployment_id : '';
                    if (deployment_id) {
                        const { data: upsertedRows, error: upsertError } = await client
                            .from(DEPLOYMENT_TABLE)
                            .upsert(serializeDeployment(patchData as Partial<IDeployment>), { onConflict: 'deployment_id' })
                            .select('*')
                            .limit(1);

                        if (!upsertError && upsertedRows && upsertedRows.length > 0) {
                            const normalized = normalizeDeployment(upsertedRows[0] as Partial<IDeployment>);
                            return upsertDeploymentStore(normalized);
                        }
                    }
                } catch {
                    // Fall back to in-memory store.
                }
            }

            const patchData: Record<string, unknown> = {
                ...query,
                ...setData
            };
            const deployment_id = typeof patchData.deployment_id === 'string' ? patchData.deployment_id : '';

            if (localMatch) {
                return localMatch;
            }

            if (deployment_id) {
                const fallback = normalizeDeployment(patchData as Partial<IDeployment>);
                return upsertDeploymentStore(fallback);
            }

            return null;
        });
    },

    countDocuments(query: Record<string, unknown>) {
        return createPromiseLikeQuery<number>(async () => {
            const client = getSupabaseClient();
            if (client) {
                try {
                    let dbQuery = client.from(DEPLOYMENT_TABLE).select('deployment_id', { count: 'exact', head: true });
                    dbQuery = applyFilters(dbQuery, query);

                    const { count, error } = await dbQuery;
                    if (!error && typeof count === 'number') {
                        return count;
                    }
                } catch {
                    // Fall back to in-memory store.
                }
            }

            return deploymentStore.filter((doc) => matchesQuery(doc, query)).length;
        });
    },
};

export const BuildArtifact = {
    find(query: Record<string, unknown>) {
        let sortSpec: SortSpec = undefined;
        let limitValue: number | undefined;

        return createPromiseLikeQuery<IBuildArtifact[]>(
            async () => {
                const client = getSupabaseClient();
                if (client) {
                    try {
                        let dbQuery = client.from(BUILD_ARTIFACT_TABLE).select('*');
                        dbQuery = applyFilters(dbQuery, query);
                        dbQuery = applySort(dbQuery, sortSpec);
                        if (limitValue !== undefined) {
                            dbQuery = dbQuery.limit(limitValue);
                        }

                        const { data, error } = await dbQuery;
                        if (!error && data) {
                            return data.map((row) =>
                                upsertBuildArtifactStore(normalizeBuildArtifact(row as Partial<IBuildArtifact>))
                            );
                        }
                    } catch {
                        // Fall back to in-memory store.
                    }
                }

                let localResults = buildArtifactStore
                    .filter((doc) => matchesQuery(doc, query))
                    .map((doc) => normalizeBuildArtifact(doc));
                localResults = sortDocs(localResults, sortSpec);

                if (limitValue !== undefined) {
                    localResults = localResults.slice(0, limitValue);
                }

                return localResults;
            },
            {
                setSort: (nextSort) => {
                    sortSpec = nextSort;
                },
                setLimit: (nextLimit) => {
                    limitValue = Number.isFinite(nextLimit) ? Math.max(0, Math.floor(nextLimit)) : undefined;
                }
            }
        );
    },

    findOne(query: Record<string, unknown>) {
        return createPromiseLikeQuery<IBuildArtifact | null>(async () => {
            const client = getSupabaseClient();
            if (client) {
                try {
                    let dbQuery = client.from(BUILD_ARTIFACT_TABLE).select('*');
                    dbQuery = applyFilters(dbQuery, query);

                    const { data, error } = await dbQuery.limit(1);
                    if (!error && data) {
                        if (data.length === 0) {
                            return null;
                        }
                        const normalized = normalizeBuildArtifact(data[0] as Partial<IBuildArtifact>);
                        return upsertBuildArtifactStore(normalized);
                    }
                } catch {
                    // Fall back to in-memory store.
                }
            }

            const localMatch = buildArtifactStore.find((doc) => matchesQuery(doc, query));
            return localMatch ? normalizeBuildArtifact(localMatch) : null;
        });
    },

    findOneAndUpdate(query: Record<string, unknown>, data: Record<string, unknown>, _opts?: Record<string, unknown>) {
        return createPromiseLikeQuery<IBuildArtifact>(async () => {
            const mergedData = { ...query, ...data };
            let localMatch = buildArtifactStore.find((doc) => matchesQuery(doc, query));

            if (localMatch) {
                Object.assign(localMatch, mergedData);
            } else {
                localMatch = normalizeBuildArtifact(mergedData);
                buildArtifactStore.push(localMatch);
            }

            const client = getSupabaseClient();
            if (client) {
                try {
                    let dbQuery = client
                        .from(BUILD_ARTIFACT_TABLE)
                        .update(serializeBuildArtifact(data as Partial<IBuildArtifact>))
                        .select('*');
                    dbQuery = applyFilters(dbQuery, query);

                    const { data: updatedRows, error: updateError } = await dbQuery;
                    if (!updateError && updatedRows && updatedRows.length > 0) {
                        const normalized = normalizeBuildArtifact(updatedRows[0] as Partial<IBuildArtifact>);
                        return upsertBuildArtifactStore(normalized);
                    }

                    const executionId = typeof mergedData.execution_id === 'string' ? mergedData.execution_id : '';
                    const relativePath = typeof mergedData.relative_path === 'string' ? mergedData.relative_path : '';
                    if (executionId && relativePath) {
                        const { data: upsertedRows, error: upsertError } = await client
                            .from(BUILD_ARTIFACT_TABLE)
                            .upsert(serializeBuildArtifact(mergedData as Partial<IBuildArtifact>), {
                                onConflict: 'execution_id,relative_path'
                            })
                            .select('*')
                            .limit(1);

                        if (!upsertError && upsertedRows && upsertedRows.length > 0) {
                            const normalized = normalizeBuildArtifact(upsertedRows[0] as Partial<IBuildArtifact>);
                            return upsertBuildArtifactStore(normalized);
                        }
                    } else {
                        const { data: insertedRows, error: insertError } = await client
                            .from(BUILD_ARTIFACT_TABLE)
                            .insert(serializeBuildArtifact(mergedData as Partial<IBuildArtifact>))
                            .select('*')
                            .limit(1);
                        if (!insertError && insertedRows && insertedRows.length > 0) {
                            const normalized = normalizeBuildArtifact(insertedRows[0] as Partial<IBuildArtifact>);
                            return upsertBuildArtifactStore(normalized);
                        }
                    }
                } catch {
                    // Fall back to in-memory store.
                }
            }

            return normalizeBuildArtifact(localMatch);
        });
    },

    countDocuments(query: Record<string, unknown>) {
        return createPromiseLikeQuery<number>(async () => {
            const client = getSupabaseClient();
            if (client) {
                try {
                    let dbQuery = client
                        .from(BUILD_ARTIFACT_TABLE)
                        .select('execution_id', { count: 'exact', head: true });
                    dbQuery = applyFilters(dbQuery, query);

                    const { count, error } = await dbQuery;
                    if (!error && typeof count === 'number') {
                        return count;
                    }
                } catch {
                    // Fall back to in-memory store.
                }
            }

            return buildArtifactStore.filter((doc) => matchesQuery(doc, query)).length;
        });
    },
};
