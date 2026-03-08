class MCPServiceShim {
  static async getTools() {
    try {
      const { MCPService } = await import('./server-build-Cxl4-FGe.js').then(n => n.d);
      const service = MCPService.getInstance();
      return service.tools;
    } catch (e) {
      console.warn("CodeSmith MCPServiceShim failed to load tools:", e);
      return {};
    }
  }
  static async isTestSpriteConfigured() {
    const tools = await this.getTools();
    return Object.keys(tools).some((name) => name.startsWith("testsprite"));
  }
}

export { MCPServiceShim };
