/**
 * Security Agent
 * Uses Groq (llama3-70b) for fast security vulnerability detection.
 */

import { callGroq } from "../models/groqClient";
import { buildPrompt } from "../utils/promptBuilder";
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

  try {
    const response = await callGroq([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);

    const parsed = JSON.parse(response);
    const issues: Issue[] = (parsed.issues || []).map((issue: Issue) => ({
      ...issue,
      agent: "security" as const,
    }));

    return issues;
  } catch (error) {
    console.error("[SecurityAgent] Error:", error);
    return [];
  }
}
