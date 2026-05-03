/**
 * Diagnostic Provider
 * Converts SentinelAI issues into VS Code inline squiggles (diagnostics).
 * Red for errors, yellow for warnings, blue for info.
 */

import * as vscode from "vscode";
import { Issue } from "../types";

// The diagnostic collection used by the entire extension
let diagnosticCollection: vscode.DiagnosticCollection;

export function initDiagnosticProvider(
  context: vscode.ExtensionContext
): vscode.DiagnosticCollection {
  diagnosticCollection = vscode.languages.createDiagnosticCollection("sentinelai");
  context.subscriptions.push(diagnosticCollection);
  return diagnosticCollection;
}


export function getDiagnosticCollection(): vscode.DiagnosticCollection {
  return diagnosticCollection;
}

/**
 * Convert severity string to VS Code DiagnosticSeverity.
 */
function mapSeverity(severity: string): vscode.DiagnosticSeverity {
  switch (severity) {
    case "error":
      return vscode.DiagnosticSeverity.Error;
    case "warning":
      return vscode.DiagnosticSeverity.Warning;
    case "info":
      return vscode.DiagnosticSeverity.Information;
    default:
      return vscode.DiagnosticSeverity.Warning;
  }
}

/**
 * Override issue severity based on user configuration.
 */
function getConfiguredSeverity(issue: Issue): vscode.DiagnosticSeverity {
  const config = vscode.workspace.getConfiguration("sentinelai");
  const configuredSeverity = config.get<string>(
    `severity.${issue.agent}`,
    issue.severity
  );
  return mapSeverity(configuredSeverity);
}

/**
 * Check if a line has a sentinel-disable comment for the given rule.
 */
function isRuleDisabled(
  document: vscode.TextDocument,
  line: number,
  rule: string
): boolean {
  if (line <= 0) {
    return false;
  }

  const prevLine = document.lineAt(line - 1).text.trim();
  // Match: // sentinel-disable <rule> or // sentinel-disable
  if (prevLine.includes("sentinel-disable")) {
    if (prevLine.includes(rule) || prevLine === "// sentinel-disable") {
      return true;
    }
  }

  return false;
}

/**
 * Update diagnostics for a document with new issues.
 */
export function updateDiagnostics(
  document: vscode.TextDocument,
  issues: Issue[],
  startLineOffset: number = 0
): void {
  const diagnostics: vscode.Diagnostic[] = [];

  for (const issue of issues) {
    const actualLine = issue.line + startLineOffset;
    const actualEndLine = issue.endLine + startLineOffset;

    // Bounds check
    if (actualLine < 0 || actualLine >= document.lineCount) {
      continue;
    }

    // Check for sentinel-disable comments
    if (isRuleDisabled(document, actualLine, issue.rule)) {
      continue;
    }

    const safeEndLine = Math.min(actualEndLine, document.lineCount - 1);
    const lineText = document.lineAt(actualLine).text;
    const endLineText = document.lineAt(safeEndLine).text;

    const startCol = Math.min(issue.column, lineText.length);
    const endCol = Math.min(issue.endColumn, endLineText.length);

    const range = new vscode.Range(
      actualLine,
      startCol,
      safeEndLine,
      endCol || endLineText.length
    );

    const diagnostic = new vscode.Diagnostic(
      range,
      `[${issue.agent}] ${issue.message}`,
      getConfiguredSeverity(issue)
    );

    diagnostic.source = "SentinelAI";
    diagnostic.code = issue.rule;

    diagnostics.push(diagnostic);
  }

  diagnosticCollection.set(document.uri, diagnostics);
}

/**
 * Clear all diagnostics.
 */
export function clearAllDiagnostics(): void {
  diagnosticCollection.clear();
}
