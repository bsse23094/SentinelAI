/**
 * Complexity Agent
 * Uses OpenRouter (Claude Haiku / DeepSeek) for deep complexity analysis.
 */

import { callOpenRouter } from "../models/openrouterClient";
import { buildPrompt } from "../utils/promptBuilder";
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

  const response = await callOpenRouter([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);

  return parseAgentIssues(response, "complexity");
}
