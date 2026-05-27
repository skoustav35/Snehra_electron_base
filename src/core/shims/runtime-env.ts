/**
 * RuntimeEnv shim — replaces @config/runtime-env.
 * Simple typed accessors for process.env.
 */
export class RuntimeEnv {
    static get(key: string): string | undefined {
        return typeof process !== 'undefined' ? process.env[key] : undefined;
    }

    static getOrDefault(key: string, defaultValue: string): string {
        const value = this.get(key);
        return value !== undefined && value !== '' ? value : defaultValue;
    }

    static getBoolean(key: string, defaultValue: boolean): boolean {
        const value = this.get(key);
        if (value === undefined || value === '') return defaultValue;
        return value === 'true' || value === '1';
    }

    static getNumber(key: string, defaultValue: number): number {
        const value = this.get(key);
        if (value === undefined || value === '') return defaultValue;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : defaultValue;
    }
}
