import type { Issue } from "../types";

interface AgentResponse {
  issues: Issue[];
}

function extractJsonCandidate(response: string): string {
  const fencedJson = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedJson?.[1]) {
    return fencedJson[1].trim();
  }

  const firstBrace = response.indexOf("{");
  const lastBrace = response.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return response.slice(firstBrace, lastBrace + 1);
  }

  return response.trim();
}

export function parseAgentIssues(response: string, agent: Issue["agent"]): Issue[] {
  let parsed: unknown;
  const jsonCandidate = extractJsonCandidate(response);

  try {
    parsed = JSON.parse(jsonCandidate);
  } catch {
    throw new Error(`${agent} agent returned invalid JSON response`);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("issues" in parsed) ||
    !Array.isArray((parsed as { issues?: unknown }).issues)
  ) {
    throw new Error(`${agent} agent response missing 'issues' array`);
  }

  return (parsed as AgentResponse).issues.map((issue) => ({
    ...issue,
    agent,
  }));
}
