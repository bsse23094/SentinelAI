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
  /** The exact code token/pattern that triggered this issue (required for filter). */
  trigger: string;
  /** Concrete impact: what goes wrong if this is not fixed (required for filter). */
  impact: string;
  /** Model self-assessed confidence score 0.0–1.0 (required for filter). */
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
