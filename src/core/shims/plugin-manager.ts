/**
 * No-op plugin manager shim — replaces @core/plugins/plugin-manager.
 * All hooks are pass-throughs.
 */
export const pluginManager = {
    async bootstrap(_ctx: Record<string, unknown>): Promise<void> { /* no-op */ },
    async onAgentMessage(_ctx: Record<string, unknown>): Promise<void> { /* no-op */ },
    async onBeforeBuild(_ctx: Record<string, unknown>): Promise<void> { /* no-op */ },
    async onAfterDeploy(_ctx: Record<string, unknown>): Promise<void> { /* no-op */ },
};
