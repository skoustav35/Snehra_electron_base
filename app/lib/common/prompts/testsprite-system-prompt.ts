/**
 * TestSprite system prompt for AI agents.
 * When TestSprite is configured, agents will actively use it to test applications,
 * automatically diagnose failures, and apply fixes.
 */
export function getTestSpriteSystemPrompt(testsprite?: {
    isConfigured: boolean;
    config?: { apiKey?: string };
}): string {
    if (!testsprite || !testsprite.isConfigured) {
        // TestSprite is OPTIONAL — agents can work without it but mention availability
        return `
<testsprite_info>
  TestSprite MCP is not currently configured. If you want AI-automated testing (test plan generation,
  cloud test execution, failure diagnosis, and auto-fix), the user can set it up in Settings > TestSprite.
  For now, generate unit tests manually when the user asks for them.
</testsprite_info>
`;
    }

    return `
<testsprite_testing_instructions>
  IMPORTANT: TestSprite MCP is configured and ACTIVE. Use it proactively for testing.

  ## Core Testing Principle
  After building or modifying any application feature, you MUST use TestSprite MCP tools to:
  1. Generate a comprehensive test plan
  2. Execute tests in the cloud
  3. Analyze results — diagnose any failures
  4. Automatically fix failing tests and re-run until all pass
  5. Report the final test outcome to the user

  ## When to Use TestSprite
  - After completing any new feature implementation
  - When the user says "test this", "run tests", "check if this works"
  - After fixing a bug (to prevent regressions)
  - Before deployment — always test before deploying
  - When the user asks to "verify", "validate", or "QA" the app

  ## TestSprite MCP Workflow
  Follow this exact workflow for every testing session:

  ### Step 1: Generate Test Plan
  Use TestSprite MCP to analyze the application code and create a smart test plan covering:
  - UI flows and user interactions (frontend)
  - API endpoints and request/response cycles (backend)
  - Authentication and authorization flows
  - Data validation and error handling
  - Edge cases and boundary conditions
  - Integration points between components

  ### Step 2: Execute Tests
  Run the generated test plan in TestSprite's cloud environment.
  Do NOT skip this step — always execute and get real results.

  ### Step 3: Analyze Failures
  For each failed test:
  - Read the error message and execution logs carefully
  - Identify the root cause (bug in code, incorrect test expectation, environment issue)
  - Determine the minimal code change required to fix it

  ### Step 4: Apply Fixes
  Write the code fix for each failure:
  - Fix only the code that caused the test failure
  - Do NOT remove or weaken test assertions to make tests pass
  - Do NOT skip failing tests
  - Apply the smallest possible change that makes the test pass

  ### Step 5: Re-run Until Green
  After applying fixes, trigger TestSprite to re-run the affected tests.
  Repeat Step 3-5 until ALL tests pass.

  ### Step 6: Report
  Provide a summary to the user:
  - Total tests: X passed, Y failed (0 after fixes)
  - Key issues found and fixed
  - Any remaining warnings or recommendations

  ## Testing Coverage Requirements
  Always ensure coverage of:
  - **Frontend**: Button clicks, form submissions, navigation, conditional rendering, loading states
  - **Backend API**: CRUD operations, authentication endpoints, error responses, data validation
  - **Integration**: End-to-end user flows from UI to database and back
  - **Security**: Auth guards, input sanitization, unauthorized access attempts

  ## Auto-Fix Rules
  When fixing test failures:
  - NEVER modify test files to reduce coverage — only fix source code
  - ALWAYS explain what was fixed and why the test was failing
  - If a test failure reveals a genuine design flaw, flag it to the user and propose a solution
  - Keep fixes atomic — one fix per failure where possible

  ## Critical Rules
  - ALWAYS run tests before saying a feature is "complete" or "ready"
  - NEVER tell the user "it should work" without running TestSprite
  - If TestSprite reports a flaky test (intermittent pass/fail), investigate and stabilize it
  - Prioritize security and data-integrity test failures above all others
</testsprite_testing_instructions>
`;
}
