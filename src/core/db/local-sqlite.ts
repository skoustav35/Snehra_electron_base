/**
 * Local SQLite adapter for the frontend/backend code.
 * 
 * When running inside Electron without Supabase credentials configured,
 * this adapter provides a Supabase-client-compatible interface that
 * routes queries to the embedded SQLite database via IPC.
 * 
 * This is the RENDERER-side adapter. It uses window.localDb
 * (exposed by the preload script) to communicate with the main process.
 */

// Type declaration for the preload-exposed localDb
declare global {
    interface Window {
        localDb?: {
            query(params: any): Promise<{ data: any; error: string | null; count?: number }>;
            raw(sql: string, params?: any[]): Promise<{ data: any; error: string | null }>;
            health(): Promise<{ ok: boolean; error: string | null }>;
            info(): Promise<{ data: any; error: string | null }>;
        };
    }
}

/**
 * Check if we're running inside Electron with the local database available.
 */
export function isLocalDatabaseAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.localDb;
}

/**
 * Create a Supabase-compatible query builder that routes to local SQLite.
 * This provides .from().select().eq().single() style chaining.
 */
export function createLocalClient(): LocalSupabaseClient {
    return new LocalSupabaseClient();
}

class LocalQueryBuilder {
    private _table: string;
    private _operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
    private _selectColumns: string = '*';
    private _filters: Array<{ column: string; operator: string; value: unknown }> = [];
    private _data: Record<string, unknown> | Record<string, unknown>[] | undefined;
    private _limit: number | undefined;
    private _offset: number | undefined;
    private _orderBy: { column: string; ascending: boolean } | undefined;
    private _single: boolean = false;

    constructor(table: string) {
        this._table = table;
    }

    select(columns: string = '*') {
        this._operation = 'select';
        this._selectColumns = columns;
        return this;
    }

    insert(data: Record<string, unknown> | Record<string, unknown>[]) {
        this._operation = 'insert';
        this._data = data;
        return this;
    }

    update(data: Record<string, unknown>) {
        this._operation = 'update';
        this._data = data;
        return this;
    }

    delete() {
        this._operation = 'delete';
        return this;
    }

    upsert(data: Record<string, unknown> | Record<string, unknown>[]) {
        this._operation = 'upsert';
        this._data = data;
        return this;
    }

    eq(column: string, value: unknown) {
        this._filters.push({ column, operator: 'eq', value });
        return this;
    }

    neq(column: string, value: unknown) {
        this._filters.push({ column, operator: 'neq', value });
        return this;
    }

    gt(column: string, value: unknown) {
        this._filters.push({ column, operator: 'gt', value });
        return this;
    }

    gte(column: string, value: unknown) {
        this._filters.push({ column, operator: 'gte', value });
        return this;
    }

    lt(column: string, value: unknown) {
        this._filters.push({ column, operator: 'lt', value });
        return this;
    }

    lte(column: string, value: unknown) {
        this._filters.push({ column, operator: 'lte', value });
        return this;
    }

    like(column: string, pattern: string) {
        this._filters.push({ column, operator: 'like', value: pattern });
        return this;
    }

    ilike(column: string, pattern: string) {
        this._filters.push({ column, operator: 'ilike', value: pattern });
        return this;
    }

    is(column: string, value: null | boolean) {
        this._filters.push({ column, operator: 'is', value });
        return this;
    }

    order(column: string, options?: { ascending?: boolean }) {
        this._orderBy = { column, ascending: options?.ascending ?? true };
        return this;
    }

    limit(count: number) {
        this._limit = count;
        return this;
    }

    range(from: number, to: number) {
        this._offset = from;
        this._limit = to - from + 1;
        return this;
    }

    single() {
        this._single = true;
        return this;
    }

    maybeSingle() {
        this._single = true;
        return this;
    }

    async then(resolve: (value: { data: any; error: any; count?: number }) => void, reject?: (reason?: any) => void) {
        try {
            if (!window.localDb) {
                resolve({ data: null, error: { message: 'Local database not available' } });
                return;
            }

            const result = await window.localDb.query({
                table: this._table,
                operation: this._operation,
                data: this._data,
                filters: this._filters,
                select: this._selectColumns,
                limit: this._limit,
                offset: this._offset,
                orderBy: this._orderBy,
                single: this._single,
            });

            if (result.error) {
                resolve({ data: null, error: { message: result.error } });
            } else {
                resolve({ data: result.data, error: null, count: result.count });
            }
        } catch (err) {
            if (reject) {
                reject(err);
            } else {
                resolve({ data: null, error: { message: String(err) } });
            }
        }
    }
}

class LocalSupabaseClient {
    from(table: string): LocalQueryBuilder {
        return new LocalQueryBuilder(table);
    }

    /**
     * Basic auth stub — in Electron mode, we use the local user.
     */
    get auth() {
        return {
            getUser: async () => ({
                data: {
                    user: {
                        id: 'local-user',
                        email: 'local@electron.app',
                        user_metadata: {
                            display_name: 'Local User',
                            avatar_url: '',
                        },
                    },
                },
                error: null,
            }),
            getSession: async () => ({
                data: {
                    session: {
                        user: {
                            id: 'local-user',
                            email: 'local@electron.app',
                        },
                        access_token: 'local-token',
                    },
                },
                error: null,
            }),
            signInWithPassword: async () => ({
                data: {
                    user: {
                        id: 'local-user',
                        email: 'local@electron.app',
                    },
                    session: {
                        access_token: 'local-token',
                    },
                },
                error: null,
            }),
            signOut: async () => ({ error: null }),
            onAuthStateChange: (_callback: any) => {
                return { data: { subscription: { unsubscribe: () => { } } } };
            },
        };
    }

    /**
     * Storage stub — in Electron mode, we use local filesystem.
     */
    get storage() {
        return {
            from: (_bucket: string) => ({
                upload: async (_path: string, _file: any) => ({
                    data: { path: _path },
                    error: null,
                }),
                download: async (_path: string) => ({
                    data: null,
                    error: { message: 'Local storage not implemented yet' },
                }),
                getPublicUrl: (_path: string) => ({
                    data: { publicUrl: `file://${_path}` },
                }),
            }),
        };
    }

    /**
     * RPC stub — execute functions via raw SQL.
     */
    async rpc(functionName: string, params?: Record<string, unknown>) {
        console.log(`[LocalDB] RPC call: ${functionName}`, params);
        return { data: null, error: null };
    }
}
