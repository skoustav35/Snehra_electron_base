import type { CoreTool } from 'ai';

export class MCPServiceShim {
    public static async getTools(): Promise<Record<string, CoreTool<any, any>>> {
        try {
            // Dynamic import to avoid strict dependency coupling between src/core and app/
            const { MCPService } = await import('~/lib/services/mcpService');
            const service = MCPService.getInstance();
            return service.tools as Record<string, CoreTool<any, any>>;
        } catch (e) {
            console.warn('CodeSmith MCPServiceShim failed to load tools:', e);
            return {};
        }
    }

    public static async isTestSpriteConfigured(): Promise<boolean> {
        const tools = await this.getTools();
        // TestSprite tools typically start with "testsprite_"
        return Object.keys(tools).some(name => name.startsWith('testsprite'));
    }
}
