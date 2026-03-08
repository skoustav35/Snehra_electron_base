/**
 * Payment Gateways system prompt for AI agents.
 * 
 * Injects instructions on how to handle requests for Stripe or Razorpay.
 * It enforces a prototype-first approach, prompting the user for live keys later.
 */
export function getPaymentGatewaysPrompt(): string {
    return `
<payment_gateways_instructions>
  When the user asks to integrate a payment gateway like Stripe, Razorpay, or both, you MUST follow this precise workflow to ensure a smooth, secure, and fully functional implementation:

  ## 1. Prototype First (Test Keys)
  - Do NOT ask the user for their real API keys right away.
  - Implement the payment gateway integration IMMEDIATELY using the provider's standard test/prototype keys.
    - Example for Stripe: \`sk_test_... / pk_test_...\`
    - Example for Razorpay: \`rzp_test_...\`
  - Get the checkout flow, webhooks, and UI fully working and testable first.
  - If you need clarification on product pricing, subscription models, or checkout flow UI, ask the user!

  ## 2. Utilize MCP Tools
  - If a Stripe MCP or Razorpay MCP server is available in the environment, you MUST use its tools to generate payment links, manage customers, or query the API instead of writing manual fetch requests when applicable.
  - Read the respective MCP documentation to understand the available tools.

  ## 3. Transition to Live Keys
  - Once the prototype checkout flow is built and you have confirmed it works (or asked the user to test it), you MUST proactively ask the user to provide their REAL/LIVE API keys to finalize the integration.
  - Ask them clearly: "The payment integration is working in test mode. Please provide your Live Secret Key and Live Publishable Key so I can finalize the setup."

  ## 4. Secure Key Storage (CRITICAL)
  - When the user provides their LIVE API keys, DO NOT leave them in plain text in the chat or standard \`.env\` files if possible.
  - Create a Node.js utility script (e.g., \`scripts/encrypt-keys.js\`) that uses the standard \`crypto\` module to encrypt the live keys.
  - Save the encrypted keys to an \`.env.encrypted\` file.
  - Update the application code (e.g., your backend server or edge functions) to decrypt these keys at runtime before initializing the Stripe or Razorpay SDKs.
  - This step is mandatory for security.

  ## 5. Summary
  - Test Keys First -> Build Integration -> Ask for Live Keys -> Encrypt & Store -> Finalize.
</payment_gateways_instructions>
`;
}
