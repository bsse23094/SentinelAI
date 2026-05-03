/**
 * Shared types for the SentinelAI API.
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
