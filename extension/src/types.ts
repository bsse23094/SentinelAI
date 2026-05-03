/**
 * Shared types for the SentinelAI VS Code extension.
 * Mirrors the API's Issue schema.
 */

export interface Issue {
  id: string;
  agent: "security" | "complexity" | "smell";
  severity: "error" | "warning" | "info";
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  explanation: string;
  fixedCode?: string;
  rule: string;
  trigger: string;
  impact: string;
  confidence: number;
}

export interface AnalyzeRequest {
  code: string;
  language: string;
  analysisType: Array<"security" | "complexity" | "smell">;
}

export interface AnalyzeResponse {
  issues: Issue[];
  model: string;
  latency: number;
}

export type AgentType = "security" | "complexity" | "smell";
export type SeverityLevel = "error" | "warning" | "info";
