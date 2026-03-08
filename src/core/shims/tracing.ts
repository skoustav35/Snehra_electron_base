/**
 * No-op tracing shim — replaces @core/observability/tracing.
 * Just executes the callback directly without any span wrapping.
 */
export class Tracing {
    static async withSpan<T>(
        _name: string,
        _attributes: Record<string, string>,
        fn: () => Promise<T>
    ): Promise<T> {
        return fn();
    }
}
