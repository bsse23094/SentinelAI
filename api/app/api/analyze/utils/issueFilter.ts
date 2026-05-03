/**
 * Issue Filter & Normalizer
 *
 * Acts as a strict gatekeeper between raw LLM output and the UI.
 * The AI model is NOT trusted. Every issue must pass validation.
 *
 * Rules:
 *   DISCARD if: trigger missing/empty, impact missing/empty, confidence < 0.75
 *   DOWNGRADE severity: "error" → "warning" when confidence < 0.9
 *   LOG all filtering decisions for debuggability.
 */

import type { Issue } from "../types";

export interface FilterResult {
  kept: Issue[];
  discarded: DiscardedIssue[];
  stats: FilterStats;
}

interface DiscardedIssue {
  id: string;
  rule: string;
  reason: string;
}

interface FilterStats {
  total: number;
  kept: number;
  discarded: number;
  downgraded: number;
}

const CONFIDENCE_THRESHOLD = 0.75;
const CONFIDENCE_ERROR_THRESHOLD = 0.9;

export function filterAndNormalizeIssues(issues: Issue[]): FilterResult {
  const kept: Issue[] = [];
  const discarded: DiscardedIssue[] = [];
  let downgraded = 0;

  for (const issue of issues) {
    // ── Gate 1: trigger must be a non-empty string ──
    if (!issue.trigger || typeof issue.trigger !== "string" || issue.trigger.trim() === "") {
      discarded.push({
        id: issue.id ?? "unknown",
        rule: issue.rule ?? "unknown",
        reason: "missing or empty 'trigger' field",
      });
      continue;
    }

    // ── Gate 2: impact must be a non-empty string ──
    if (!issue.impact || typeof issue.impact !== "string" || issue.impact.trim() === "") {
      discarded.push({
        id: issue.id ?? "unknown",
        rule: issue.rule ?? "unknown",
        reason: "missing or empty 'impact' field",
      });
      continue;
    }

    // ── Gate 3: confidence must be a number >= threshold ──
    const confidence = typeof issue.confidence === "number" ? issue.confidence : -1;
    if (confidence < CONFIDENCE_THRESHOLD) {
      discarded.push({
        id: issue.id ?? "unknown",
        rule: issue.rule ?? "unknown",
        reason: `confidence too low (${confidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD})`,
      });
      continue;
    }

    // ── Normalize: downgrade error → warning if confidence < 0.9 ──
    const normalized = { ...issue };
    if (normalized.severity === "error" && confidence < CONFIDENCE_ERROR_THRESHOLD) {
      normalized.severity = "warning";
      downgraded++;
    }

    kept.push(normalized);
  }

  return {
    kept,
    discarded,
    stats: {
      total: issues.length,
      kept: kept.length,
      discarded: discarded.length,
      downgraded,
    },
  };
}

/**
 * Formats a human-readable log line for the filter result.
 * Used by the route handler for server-side console logging.
 */
export function formatFilterLog(result: FilterResult, agent: string): string {
  const { stats, discarded } = result;
  const lines: string[] = [
    `[Filter:${agent}] ${stats.total} → ${stats.kept} issues kept` +
      (stats.discarded > 0 ? `, ${stats.discarded} discarded` : "") +
      (stats.downgraded > 0 ? `, ${stats.downgraded} severity downgraded` : ""),
  ];

  for (const d of discarded) {
    lines.push(`  ✗ [${d.id}] ${d.rule}: ${d.reason}`);
  }

  return lines.join("\n");
}
