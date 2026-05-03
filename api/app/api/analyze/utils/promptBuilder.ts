/**
 * Prompt Builder
 * Constructs system + user prompts for each analysis agent.
 */

export interface PromptConfig {
  code: string;
  language: string;
  agentType: "security" | "complexity" | "smell";
}

const ISSUE_SCHEMA_DESCRIPTION = `
Return a JSON object with an "issues" array. Each issue must have:
- "id": a unique short string identifier (e.g., "sec-001")
- "agent": "${"{agentType}"}" (the agent type)
- "severity": "error" | "warning" | "info"
- "line": 0-indexed line number where the issue starts
- "column": 0-indexed column number
- "endLine": 0-indexed line number where the issue ends
- "endColumn": 0-indexed column number where the issue ends
- "message": a short one-line description (shown inline)
- "explanation": a detailed explanation of why this is an issue and how to fix it
- "fixedCode": the corrected code snippet that replaces the problematic code (optional but preferred)
- "rule": a kebab-case rule identifier (e.g., "sql-injection", "deep-nesting")

If no issues are found, return {"issues": []}.
IMPORTANT: Return ONLY valid JSON. No markdown, no code fences, no extra text.
`;

const SYSTEM_PROMPTS: Record<string, string> = {
  security: `You are SentinelAI's Security Agent — an expert code security auditor.
Your job is to find security vulnerabilities in the given code snippet.

Look for:
- SQL injection (string concatenation in queries)
- Cross-site scripting (XSS) — unescaped user input in HTML/DOM
- Hardcoded secrets (API keys, passwords, tokens in source code)
- eval() usage and code injection risks
- Prototype pollution
- Path traversal vulnerabilities
- Insecure cryptographic practices
- Command injection (shell execution with user input)
- Insecure deserialization
- Missing authentication/authorization checks

Be precise about line numbers. Only report real issues, not false positives.
${ISSUE_SCHEMA_DESCRIPTION.replace("{agentType}", "security")}`,

  complexity: `You are SentinelAI's Complexity Agent — an expert at identifying overly complex code.
Your job is to find complexity issues that reduce code maintainability.

Look for:
- High cyclomatic complexity (many branching paths in a single function)
- Deep nesting (more than 3 levels of nested blocks)
- Functions that are too long (over 40 lines of logic)
- Too many parameters (more than 4 parameters)
- Complex conditional expressions
- Functions with too many return paths
- Callback hell / deeply nested promises

Be precise about line numbers. Only report significant complexity issues.
${ISSUE_SCHEMA_DESCRIPTION.replace("{agentType}", "complexity")}`,

  smell: `You are SentinelAI's Code Smell Agent — an expert at identifying bad coding patterns.
Your job is to find code smells and maintainability anti-patterns.

Look for:
- Duplicate code blocks (copy-pasted logic)
- Magic numbers (unexplained numeric literals)
- God functions (functions doing too many things)
- Poor naming (single-letter variables outside loops, misleading names)
- Dead code (unreachable or unused code)
- Feature envy (function uses another object's data more than its own)
- Long parameter lists
- Data clumps (groups of variables that always appear together)
- Comments that explain "what" instead of "why" (code should be self-documenting)

Be precise about line numbers. Only report meaningful code smells.
${ISSUE_SCHEMA_DESCRIPTION.replace("{agentType}", "smell")}`,
};

export function buildPrompt(config: PromptConfig): {
  system: string;
  user: string;
} {
  const system = SYSTEM_PROMPTS[config.agentType];
  if (!system) {
    throw new Error(`Unknown agent type: ${config.agentType}`);
  }

  const user = `Analyze this ${config.language} code for ${config.agentType} issues:

\`\`\`${config.language}
${config.code}
\`\`\`

Return your analysis as a JSON object with an "issues" array.`;

  return { system, user };
}
