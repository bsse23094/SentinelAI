/**
 * Hover Provider
 * Shows detailed AI explanations when hovering over SentinelAI squiggles.
 */

import * as vscode from "vscode";
import { Issue } from "../types";

// Store latest issues per document URI for hover lookups
const issueMap = new Map<string, Issue[]>();

export function setLatestIssues(uri: vscode.Uri, issues: Issue[]): void {
  issueMap.set(uri.toString(), issues);
}

export function getLatestIssues(uri: vscode.Uri): Issue[] {
  return issueMap.get(uri.toString()) || [];
}

export function clearIssues(uri?: vscode.Uri): void {
  if (uri) {
    issueMap.delete(uri.toString());
  } else {
    issueMap.clear();
  }
}

const SEVERITY_ICONS: Record<string, string> = {
  error: "🔴",
  warning: "🟡",
  info: "🔵",
};

const AGENT_LABELS: Record<string, string> = {
  security: "🛡️ Security",
  complexity: "🔄 Complexity",
  smell: "👃 Code Smell",
};

export class SentinelHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    const issues = getLatestIssues(document.uri);
    if (issues.length === 0) {
      return null;
    }

    // Find issues that overlap with the hover position
    const matchingIssues = issues.filter((issue) => {
      const issueRange = new vscode.Range(
        issue.line,
        issue.column,
        issue.endLine,
        issue.endColumn || document.lineAt(Math.min(issue.endLine, document.lineCount - 1)).text.length
      );
      return issueRange.contains(position);
    });

    if (matchingIssues.length === 0) {
      return null;
    }

    const contents = new vscode.MarkdownString();
    contents.isTrusted = true;
    contents.supportHtml = true;

    for (const issue of matchingIssues) {
      const icon = SEVERITY_ICONS[issue.severity] || "⚪";
      const agentLabel = AGENT_LABELS[issue.agent] || issue.agent;

      contents.appendMarkdown(
        `### ${icon} ${agentLabel}: ${issue.message}\n\n`
      );
      contents.appendMarkdown(`**Rule:** \`${issue.rule}\`\n\n`);
      contents.appendMarkdown(`${issue.explanation}\n\n`);

      if (issue.fixedCode) {
        contents.appendMarkdown(`**Suggested Fix:**\n\n`);
        contents.appendCodeblock(issue.fixedCode, document.languageId);
        contents.appendMarkdown(`\n`);
      }

      contents.appendMarkdown(`---\n\n`);
    }

    return new vscode.Hover(contents);
  }
}
