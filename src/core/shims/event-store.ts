/**
 * Event store with in-memory subscriptions and optional Supabase persistence.
 */

import { getSupabaseClient } from '../db/supabase';

const EVENTS_TABLE = 'codesmith_events';

export interface IEvent {
    execution_id: string;
    workspace_id: string;
    user_id: string;
    agent_id: string | null;
    event_type: string;
    payload: Record<string, unknown>;
    timestamp: Date;
    sequence: number;
    [key: string]: unknown;
}

interface AppendEventInput {
    execution_id: string;
    workspace_id: string;
    user_id: string;
    agent_id: string | null;
    event_type: string;
    payload: Record<string, unknown>;
}

type EventListener = (event: IEvent) => void;

interface PersistedEventRow {
    id?: number;
    execution_id: string;
    workspace_id: string;
    user_id: string;
    agent_id: string | null;
    event_type: string;
    payload: Record<string, unknown>;
    timestamp: string | Date;
    sequence: number | string;
}

function normalizeEventRow(row: PersistedEventRow): IEvent {
    const timestamp = row.timestamp instanceof Date ? row.timestamp : new Date(String(row.timestamp || Date.now()));

    return {
        execution_id: row.execution_id,
        workspace_id: row.workspace_id,
        user_id: row.user_id,
        agent_id: row.agent_id || null,
        event_type: row.event_type,
        payload: (row.payload || {}) as Record<string, unknown>,
        timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
        sequence: Number(row.sequence) || 0
    };
}

function sortEvents(events: IEvent[], sortSpec?: Record<string, unknown>): IEvent[] {
    if (!sortSpec || Object.keys(sortSpec).length === 0) {
        return events;
    }

    const entries = Object.entries(sortSpec);
    return [...events].sort((a, b) => {
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

class EventStore {
    private events: Map<string, IEvent[]> = new Map();
    private sequenceByExecution: Map<string, number> = new Map();
    private listeners: EventListener[] = [];
    private appendChain: Promise<void> = Promise.resolve();

    private async withAppendLock<T>(operation: () => Promise<T>): Promise<T> {
        const previous = this.appendChain.catch(() => undefined);
        let release: () => void = () => undefined;

        this.appendChain = new Promise<void>((resolve) => {
            release = resolve;
        });

        await previous;
        try {
            return await operation();
        } finally {
            release();
        }
    }

    private updateSequenceCache(execution_id: string, events: IEvent[]): void {
        if (events.length === 0) {
            return;
        }

        const maxSequence = events.reduce((max, event) => Math.max(max, Number(event.sequence) || 0), 0);
        const existing = this.sequenceByExecution.get(execution_id) || 0;
        if (maxSequence > existing) {
            this.sequenceByExecution.set(execution_id, maxSequence);
        }
    }

    private async getNextSequence(execution_id: string): Promise<number> {
        const cached = this.sequenceByExecution.get(execution_id);
        if (typeof cached === 'number') {
            return cached + 1;
        }

        const client = getSupabaseClient();
        if (client) {
            try {
                const { data, error } = await client
                    .from(EVENTS_TABLE)
                    .select('sequence')
                    .eq('execution_id', execution_id)
                    .order('sequence', { ascending: false })
                    .limit(1);

                if (!error && data && data.length > 0) {
                    const latest = Number((data[0] as { sequence: number | string }).sequence) || 0;
                    this.sequenceByExecution.set(execution_id, latest);
                    return latest + 1;
                }
            } catch {
                // Fall back to in-memory sequence when database is unavailable.
            }
        }

        const localEvents = this.events.get(execution_id) || [];
        const localMax = localEvents.reduce((max, event) => Math.max(max, Number(event.sequence) || 0), 0);
        this.sequenceByExecution.set(execution_id, localMax);
        return localMax + 1;
    }

    subscribe(listener: EventListener): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter((l) => l !== listener);
        };
    }

    async appendEvent(input: AppendEventInput): Promise<IEvent> {
        return this.withAppendLock(async () => {
            const nextSequence = await this.getNextSequence(input.execution_id);
            const fallbackEvent: IEvent = {
                ...input,
                payload: input.payload || {},
                timestamp: new Date(),
                sequence: nextSequence,
            };

            let emittedEvent = fallbackEvent;
            const client = getSupabaseClient();
            if (client) {
                try {
                    const { data, error } = await client
                        .from(EVENTS_TABLE)
                        .insert({
                            execution_id: fallbackEvent.execution_id,
                            workspace_id: fallbackEvent.workspace_id,
                            user_id: fallbackEvent.user_id,
                            agent_id: fallbackEvent.agent_id,
                            event_type: fallbackEvent.event_type,
                            payload: fallbackEvent.payload,
                            timestamp: fallbackEvent.timestamp.toISOString(),
                            sequence: fallbackEvent.sequence
                        })
                        .select('*')
                        .limit(1);

                    if (!error && data && data.length > 0) {
                        emittedEvent = normalizeEventRow(data[0] as PersistedEventRow);
                    }
                } catch {
                    // Fall back to in-memory event if persistence fails.
                }
            }

            const existing = this.events.get(input.execution_id) || [];
            existing.push(emittedEvent);
            this.events.set(input.execution_id, existing);
            this.sequenceByExecution.set(input.execution_id, Number(emittedEvent.sequence) || nextSequence);

            for (const listener of this.listeners) {
                try {
                    listener(emittedEvent);
                } catch {
                    // Listener failures should not break persistence.
                }
            }

            return emittedEvent;
        });
    }

    async getEvents(execution_id: string): Promise<IEvent[]> {
        const client = getSupabaseClient();
        if (client) {
            try {
                const { data, error } = await client
                    .from(EVENTS_TABLE)
                    .select('*')
                    .eq('execution_id', execution_id)
                    .order('sequence', { ascending: true });

                if (!error && data) {
                    const events = data.map((row) => normalizeEventRow(row as PersistedEventRow));
                    this.updateSequenceCache(execution_id, events);
                    return events;
                }
            } catch {
                // Fall back to in-memory cache.
            }
        }

        return this.events.get(execution_id) || [];
    }

    async getEventsByType(execution_id: string, types: string[]): Promise<IEvent[]> {
        if (types.length === 0) {
            return [];
        }

        const client = getSupabaseClient();
        if (client) {
            try {
                let query = client
                    .from(EVENTS_TABLE)
                    .select('*')
                    .eq('execution_id', execution_id);

                query = types.length === 1
                    ? query.eq('event_type', types[0])
                    : query.in('event_type', types);

                const { data, error } = await query.order('sequence', { ascending: true });
                if (!error && data) {
                    const events = data.map((row) => normalizeEventRow(row as PersistedEventRow));
                    this.updateSequenceCache(execution_id, events);
                    return events;
                }
            } catch {
                // Fall back to in-memory cache.
            }
        }

        const all = this.events.get(execution_id) || [];
        return all.filter((event) => types.includes(event.event_type));
    }

    async getLatestEvent(execution_id: string, event_type: string): Promise<IEvent | null> {
        const client = getSupabaseClient();
        if (client) {
            try {
                const { data, error } = await client
                    .from(EVENTS_TABLE)
                    .select('*')
                    .eq('execution_id', execution_id)
                    .eq('event_type', event_type)
                    .order('sequence', { ascending: false })
                    .limit(1);

                if (!error && data) {
                    const rows = data.map((row) => normalizeEventRow(row as PersistedEventRow));
                    this.updateSequenceCache(execution_id, rows);
                    return rows.length > 0 ? rows[0] : null;
                }
            } catch {
                // Fall back to in-memory cache.
            }
        }

        const all = this.events.get(execution_id) || [];
        for (let i = all.length - 1; i >= 0; i--) {
            if (all[i].event_type === event_type) {
                return all[i];
            }
        }

        return null;
    }

    clear(execution_id?: string): void {
        if (execution_id) {
            this.events.delete(execution_id);
            this.sequenceByExecution.delete(execution_id);
            return;
        }

        this.events.clear();
        this.sequenceByExecution.clear();
    }
}

export const eventStore = new EventStore();

// Re-export IEvent for consumers that import it from the model
export const Event = {
    find(query: Record<string, unknown>) {
        const execution_id = String(query.execution_id || '');
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
            async exec(): Promise<IEvent[]> {
                let results = await eventStore.getEvents(execution_id);
                results = results.filter((event) =>
                    Object.entries(query).every(([key, value]) => event[key] === value)
                );
                results = sortEvents(results, sortSpec);

                if (limitValue !== undefined) {
                    results = results.slice(0, limitValue);
                }

                return results;
            },
        };
    },
};
