/**
 * Logger shim — replaces @shared/logger.
 * A simple console-based logger matching the interface CodeSmith expects.
 */

function formatArgs(args: unknown[]): string {
    return args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
}

export const logger = {
    info(message: string, ...args: unknown[]): void {
        console.log(`[CodeSmith] ${message}`, ...args);
    },
    warn(message: string, ...args: unknown[]): void {
        console.warn(`[CodeSmith] ${message}`, ...args);
    },
    error(message: string, ...args: unknown[]): void {
        console.error(`[CodeSmith] ${message}`, ...args);
    },
    debug(message: string, ...args: unknown[]): void {
        if (process.env.CODESMITH_DEBUG === 'true') {
            console.debug(`[CodeSmith] ${message}`, ...args);
        }
    },
};
