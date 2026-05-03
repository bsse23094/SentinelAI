/**
 * Code Smell Agent
 * Uses Groq (llama3-70b) for fast code smell detection.
 */

import { callGroq } from "../models/groqClient";
import { buildPrompt } from "../utils/promptBuilder";
import type { Issue } from "../types";

export async function runSmellAgent(
  code: string,
  language: string
): Promise<Issue[]> {
  const { system, user } = buildPrompt({
    code,
    language,
    agentType: "smell",
  });

  try {
    const response = await callGroq([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);

    const parsed = JSON.parse(response);
    const issues: Issue[] = (parsed.issues || []).map((issue: Issue) => ({
      ...issue,
      agent: "smell" as const,
    }));

    return issues;
  } catch (error) {
    console.error("[SmellAgent] Error:", error);
    return [];
  }
}
