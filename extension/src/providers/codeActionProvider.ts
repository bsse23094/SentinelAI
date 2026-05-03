/**
 * Code Action Provider
 * Provides "Fix with SentinelAI" quick-fix actions for flagged issues.
 * Users see a lightbulb icon and can apply the AI-generated fix in one click.
 */

import * as vscode from "vscode";
import { Issue } from "../types";
import { getLatestIssues } from "./hoverProvider";

export class SentinelCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeAction[]> {
    const issues = getLatestIssues(document.uri);
    if (issues.length === 0) {
      return [];
    }

    const actions: vscode.CodeAction[] = [];

    // Find issues that have fixes and overlap with the given range
    for (const issue of issues) {
      if (!issue.fixedCode) {
        continue;
      }

      const issueRange = new vscode.Range(
        issue.line,
        issue.column,
        issue.endLine,
        issue.endColumn || document.lineAt(
          Math.min(issue.endLine, document.lineCount - 1)
        ).text.length
      );

      // Check if the issue overlaps with the context range
      if (!issueRange.intersection(range)) {
        continue;
      }

      // Check if there's a matching diagnostic
      const hasDiagnostic = context.diagnostics.some(
        (d) => d.source === "SentinelAI" && d.code === issue.rule
      );

      if (!hasDiagnostic && context.diagnostics.length > 0) {
        continue;
      }

      const action = new vscode.CodeAction(
        `Fix with SentinelAI: ${issue.message}`,
        vscode.CodeActionKind.QuickFix
      );

      action.edit = new vscode.WorkspaceEdit();

      // Calculate the full line range for replacement
      const fullLineRange = new vscode.Range(
        issue.line,
        0,
        issue.endLine,
        document.lineAt(
          Math.min(issue.endLine, document.lineCount - 1)
        ).text.length
      );

      action.edit.replace(document.uri, fullLineRange, issue.fixedCode);
      action.isPreferred = true;

      // Associate with the diagnostic
      const matchingDiagnostic = context.diagnostics.find(
        (d) => d.source === "SentinelAI" && d.code === issue.rule
      );
      if (matchingDiagnostic) {
        action.diagnostics = [matchingDiagnostic];
      }

      actions.push(action);
    }

    return actions;
  }
}
