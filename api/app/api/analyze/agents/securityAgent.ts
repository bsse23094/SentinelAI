/**
 * Security Agent
 * Uses Groq (llama3-70b) for fast security vulnerability detection.
 * Falls back to OpenRouter when Groq is rate-limited.
 */

import { buildPrompt } from "../utils/promptBuilder";
import { callGroqWithOpenRouterFallback } from "../utils/modelFallback";
import { parseAgentIssues } from "../utils/parseIssues";
import type { Issue } from "../types";

export async function runSecurityAgent(
  code: string,
  language: string
): Promise<Issue[]> {
  const { system, user } = buildPrompt({
    code,
    language,
    agentType: "security",
  });

  const response = await callGroqWithOpenRouterFallback([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);

  return parseAgentIssues(response, "security");
}
