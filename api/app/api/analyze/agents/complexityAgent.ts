/**
 * Complexity Agent
 * Uses OpenRouter (Claude Haiku / DeepSeek) for deep complexity analysis.
 */

import { callOpenRouter } from "../models/openrouterClient";
import { buildPrompt } from "../utils/promptBuilder";
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

  try {
    const response = await callOpenRouter([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);

    const parsed = JSON.parse(response);
    const issues: Issue[] = (parsed.issues || []).map((issue: Issue) => ({
      ...issue,
      agent: "complexity" as const,
    }));

    return issues;
  } catch (error) {
    console.error("[ComplexityAgent] Error:", error);
    return [];
  }
}
