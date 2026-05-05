/**
 * Complexity Agent
 * Uses OpenRouter (Claude Haiku / DeepSeek) for deep complexity analysis.
 */

import { buildPrompt } from "../utils/promptBuilder";
import { callGroqWithOpenRouterFallback } from "../utils/modelFallback";
import { parseAgentIssues } from "../utils/parseIssues";
import type { Issue } from "../types";

export async function runComplexityAgent(
  code: string,
  language: string
): Promise<Issue[]> {
  const { system, user } = buildPrompt({
    code,
    language,
    agentType: "complexity",
  });

  const response = await callGroqWithOpenRouterFallback([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);

  return parseAgentIssues(response, "complexity");
}
