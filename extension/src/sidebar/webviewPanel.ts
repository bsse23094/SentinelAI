/**
 * Sidebar Webview Panel
 * Shows a summary of analysis results in the SentinelAI sidebar.
 */

import * as vscode from "vscode";
import { Issue } from "../types";
import { getLatestIssues } from "../providers/hoverProvider";

export class SentinelSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "sentinelai.summaryView";
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    this.updateContent();

    // Update when the view becomes visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.updateContent();
      }
    });
  }

  /**
   * Refresh the sidebar with current issues.
   */
  public updateContent(): void {
    if (!this._view) {
      return;
    }

    const editor = vscode.window.activeTextEditor;
    let issues: Issue[] = [];
    let fileName = "No file open";

    if (editor) {
      issues = getLatestIssues(editor.document.uri);
      fileName = editor.document.fileName.split(/[\\/]/).pop() || "Unknown";
    }

    this._view.webview.html = this._getHtmlForWebview(issues, fileName);
  }

  private _getHtmlForWebview(issues: Issue[], fileName: string): string {
    const securityIssues = issues.filter((i) => i.agent === "security");
    const complexityIssues = issues.filter((i) => i.agent === "complexity");
    const smellIssues = issues.filter((i) => i.agent === "smell");

    const errorCount = issues.filter((i) => i.severity === "error").length;
    const warningCount = issues.filter((i) => i.severity === "warning").length;
    const infoCount = issues.filter((i) => i.severity === "info").length;

    const issueListHtml = issues.length === 0
      ? `<div class="empty-state">
           <div class="empty-icon">✓</div>
           <p>No issues found</p>
           <p class="subtext">Save a file to trigger analysis</p>
         </div>`
      : issues
          .map(
            (issue) => `
        <div class="issue issue-${issue.severity}">
          <div class="issue-header">
            <span class="severity-badge ${issue.severity}">${issue.severity.toUpperCase()}</span>
            <span class="agent-badge">${issue.agent}</span>
          </div>
          <div class="issue-message">${escapeHtml(issue.message)}</div>
          <div class="issue-location">Line ${issue.line + 1} · ${issue.rule}</div>
        </div>
      `
          )
          .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 0;
      margin: 0;
    }

    .header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .header h2 {
      margin: 0 0 4px 0;
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-foreground);
    }

    .file-name {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .summary {
      display: flex;
      gap: 12px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      font-size: 12px;
    }

    .summary-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }

    .dot.error { background: var(--vscode-errorForeground, #f44336); }
    .dot.warning { background: var(--vscode-editorWarning-foreground, #ff9800); }
    .dot.info { background: var(--vscode-editorInfo-foreground, #2196f3); }

    .section {
      padding: 8px 16px;
    }

    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      margin: 8px 0 4px 0;
    }

    .issue {
      padding: 8px 10px;
      margin: 4px 0;
      border-radius: 4px;
      background: var(--vscode-editor-background);
      border-left: 3px solid transparent;
    }

    .issue-error { border-left-color: var(--vscode-errorForeground, #f44336); }
    .issue-warning { border-left-color: var(--vscode-editorWarning-foreground, #ff9800); }
    .issue-info { border-left-color: var(--vscode-editorInfo-foreground, #2196f3); }

    .issue-header {
      display: flex;
      gap: 6px;
      margin-bottom: 4px;
    }

    .severity-badge, .agent-badge {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 3px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .severity-badge.error {
      background: rgba(244, 67, 54, 0.15);
      color: var(--vscode-errorForeground, #f44336);
    }

    .severity-badge.warning {
      background: rgba(255, 152, 0, 0.15);
      color: var(--vscode-editorWarning-foreground, #ff9800);
    }

    .severity-badge.info {
      background: rgba(33, 150, 243, 0.15);
      color: var(--vscode-editorInfo-foreground, #2196f3);
    }

    .agent-badge {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .issue-message {
      font-size: 12px;
      line-height: 1.4;
      margin-bottom: 2px;
    }

    .issue-location {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .empty-state {
      text-align: center;
      padding: 40px 16px;
      color: var(--vscode-descriptionForeground);
    }

    .empty-icon {
      font-size: 32px;
      margin-bottom: 8px;
      color: var(--vscode-charts-green, #4caf50);
    }

    .subtext {
      font-size: 11px;
      opacity: 0.7;
    }

    .agent-section {
      padding: 4px 16px;
    }

    .agent-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-foreground);
      margin: 8px 0 4px 0;
    }

    .agent-count {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      font-weight: 400;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>SentinelAI Summary</h2>
    <div class="file-name">${escapeHtml(fileName)}</div>
  </div>

  <div class="summary">
    <div class="summary-item"><span class="dot error"></span> ${errorCount} errors</div>
    <div class="summary-item"><span class="dot warning"></span> ${warningCount} warnings</div>
    <div class="summary-item"><span class="dot info"></span> ${infoCount} info</div>
  </div>

  ${securityIssues.length > 0
    ? `<div class="agent-section">
         <div class="agent-header">🛡️ Security <span class="agent-count">(${securityIssues.length})</span></div>
       </div>`
    : ""
  }

  ${complexityIssues.length > 0
    ? `<div class="agent-section">
         <div class="agent-header">🔄 Complexity <span class="agent-count">(${complexityIssues.length})</span></div>
       </div>`
    : ""
  }

  ${smellIssues.length > 0
    ? `<div class="agent-section">
         <div class="agent-header">👃 Code Smell <span class="agent-count">(${smellIssues.length})</span></div>
       </div>`
    : ""
  }

  <div class="section">
    ${issueListHtml}
  </div>
</body>
</html>`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
