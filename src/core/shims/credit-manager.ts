/**
 * CreditManager — Supabase-backed credit balance tracking.
 * Falls back to in-memory Map when Supabase is not configured.
 */
import { getSupabaseClient } from '../db/supabase';

const BALANCE_TABLE = 'codesmith_credit_balances';
const TX_TABLE = 'codesmith_credit_transactions';

export type TransactionType = 'purchase' | 'deduction' | 'refund' | 'bonus';

export interface CreditTransaction {
    id?: number;
    user_id: string;
    amount: number;
    type: TransactionType;
    description: string;
    reference_id?: string;
    created_at?: string;
}

// In-memory fallback stores
const memoryBalances = new Map<string, number>();
const memoryTransactions: CreditTransaction[] = [];

export class CreditManager {
    /**
     * Get current credit balance for a user.
     */
    static async getBalance(user_id: string): Promise<number> {
        const client = getSupabaseClient();
        if (client) {
            try {
                const { data, error } = await client
                    .from(BALANCE_TABLE)
                    .select('balance')
                    .eq('user_id', user_id)
                    .limit(1);

                if (!error && data && data.length > 0) {
                    const balance = Number((data[0] as { balance: number }).balance) || 0;
                    memoryBalances.set(user_id, balance);
                    return balance;
                }

                if (!error && data && data.length === 0) {
                    return 0;
                }
            } catch {
                // Fall back to in-memory store.
            }
        }

        return memoryBalances.get(user_id) || 0;
    }

    /**
     * Debit credits from a user's balance.
     * Throws if insufficient balance.
     */
    static async debit(
        execution_id: string,
        user_id: string,
        _workspace_id: string,
        amount: number,
        reason: string
    ): Promise<void> {
        if (amount <= 0) {
            return;
        }

        const currentBalance = await this.getBalance(user_id);
        if (currentBalance < amount) {
            throw new Error(
                `Insufficient credits: need ${amount} but only have ${currentBalance}. Please top up your credits.`
            );
        }

        const newBalance = currentBalance - amount;

        const client = getSupabaseClient();
        if (client) {
            try {
                // Upsert balance
                const { error: balanceError } = await client
                    .from(BALANCE_TABLE)
                    .upsert(
                        { user_id, balance: newBalance, updated_at: new Date().toISOString() },
                        { onConflict: 'user_id' }
                    );

                if (balanceError) {
                    throw balanceError;
                }

                // Insert transaction record
                await client.from(TX_TABLE).insert({
                    user_id,
                    amount: -amount,
                    type: 'deduction',
                    description: reason,
                    reference_id: execution_id,
                    created_at: new Date().toISOString(),
                });

                memoryBalances.set(user_id, newBalance);
                return;
            } catch (err) {
                // If Supabase fails mid-way, still update memory to prevent double-spending
                if (err instanceof Error && err.message.includes('Insufficient')) {
                    throw err;
                }
                // Fall back to in-memory
            }
        }

        // In-memory fallback
        memoryBalances.set(user_id, newBalance);
        memoryTransactions.push({
            user_id,
            amount: -amount,
            type: 'deduction',
            description: reason,
            reference_id: execution_id,
            created_at: new Date().toISOString(),
        });
    }

    /**
     * Add credits to a user's balance (purchase, bonus, or refund).
     */
    static async credit(
        user_id: string,
        amount: number,
        type: Exclude<TransactionType, 'deduction'>,
        description: string,
        reference_id?: string
    ): Promise<number> {
        if (amount <= 0) {
            return this.getBalance(user_id);
        }

        const currentBalance = await this.getBalance(user_id);
        const newBalance = currentBalance + amount;

        const client = getSupabaseClient();
        if (client) {
            try {
                const { error: balanceError } = await client
                    .from(BALANCE_TABLE)
                    .upsert(
                        { user_id, balance: newBalance, updated_at: new Date().toISOString() },
                        { onConflict: 'user_id' }
                    );

                if (!balanceError) {
                    await client.from(TX_TABLE).insert({
                        user_id,
                        amount,
                        type,
                        description,
                        reference_id: reference_id || null,
                        created_at: new Date().toISOString(),
                    });
                }

                memoryBalances.set(user_id, newBalance);
                return newBalance;
            } catch {
                // Fall back to in-memory
            }
        }

        memoryBalances.set(user_id, newBalance);
        memoryTransactions.push({
            user_id,
            amount,
            type,
            description,
            reference_id,
            created_at: new Date().toISOString(),
        });

        return newBalance;
    }

    /**
     * Get transaction history for a user.
     */
    static async getTransactions(user_id: string, limit: number = 50): Promise<CreditTransaction[]> {
        const client = getSupabaseClient();
        if (client) {
            try {
                const { data, error } = await client
                    .from(TX_TABLE)
                    .select('*')
                    .eq('user_id', user_id)
                    .order('created_at', { ascending: false })
                    .limit(limit);

                if (!error && data) {
                    return data as CreditTransaction[];
                }
            } catch {
                // Fall back to in-memory
            }
        }

        return memoryTransactions
            .filter((tx) => tx.user_id === user_id)
            .sort((a, b) => {
                const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
                const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
                return bTime - aTime;
            })
            .slice(0, limit);
    }
}
