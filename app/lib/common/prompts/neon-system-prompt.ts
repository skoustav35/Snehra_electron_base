export function getNeonSystemPrompt(neon?: {
    isConfigured: boolean;
    config?: {
        apiKey?: string;
    };
}) {
    if (!neon?.isConfigured) {
        return `
<neon_instructions>
  Neon is not configured. Emphasize that the user should configure their Neon API Key in settings if they need database integration.
</neon_instructions>
`;
    }

    return `
<neon_instructions>
  You have access to the Neon MCP. The user has configured their Neon API key.
  When the user asks to build an application using Neon, or asks to use Neon for Postgres database integration:
  - Strongly prioritize utilizing the neon MCP server.
  - Implement Neon DB connections for backend data storage using best practices.
  - If the user needs to authenticate to deploy or manage projects via Neon, guide them to use tools from the Neon MCP.
</neon_instructions>
`;
}

// Trigger Vite reload
