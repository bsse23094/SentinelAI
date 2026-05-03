/**
 * Save Handler
 * Debounced onSave trigger that runs SentinelAI analysis automatically.
 * Uses an Output Channel for verbose logging (View → Output → SentinelAI).
 */


import * as vscode from "vscode";
import { extractFile } from "../extraction/codeExtractor";
import { analyzeCode } from "../api/client";
import { resultCache } from "../cache/resultCache";
import { updateDiagnostics } from "../providers/diagnosticProvider";
import { setLatestIssues } from "../providers/hoverProvider";
import { AgentType } from "../types";


// Track debounce timers per document URI
const debounceTimers = new Map<string, NodeJS.Timeout>();

// Visible output channel for debugging
let outputChannel: vscode.OutputChannel;

// Status bar
let statusBarItem: vscode.StatusBarItem;

// Show a "working" message the first time analysis succeeds
let hasShownFirstSuccess = false;

export function getOutputChannel(): vscode.OutputChannel {
  return outputChannel;
}

export function initSaveHandler(context: vscode.ExtensionContext): void {
  // Output channel — visible in View → Output → "SentinelAI"
  outputChannel = vscode.window.createOutputChannel("SentinelAI");
  context.subscriptions.push(outputChannel);

  outputChannel.appendLine("=== SentinelAI Output Channel initialized ===");
  outputChannel.appendLine(`API URL: ${vscode.workspace.getConfiguration("sentinelai").get("apiUrl", "http://localhost:3000")}`);

  // Status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.text = "$(shield) SentinelAI";
  statusBarItem.tooltip = "SentinelAI — Click to open summary";
  statusBarItem.command = "sentinelai.openSummary";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Watch for saves
  const disposable = vscode.workspace.onDidSaveTextDocument((document) => {
    const config = vscode.workspace.getConfiguration("sentinelai");
    const triggerOnSave = config.get<boolean>("triggerOnSave", true);

    if (!triggerOnSave) {
      outputChannel.appendLine("[Save] triggerOnSave is disabled — skipping.");
      return;
    }

    // ── Guard 1: Only process real on-disk files ──
    // Rejects untitled:, git:, output:, vscode-notebook-cell: etc.
    if (document.uri.scheme !== "file") {
      outputChannel.appendLine(`[Save] Skipping non-file URI scheme: ${document.uri.scheme}`);
      return;
    }

    // ── Guard 2: Reject VS Code internal / extension storage paths ──
    // Blackbox and other extensions create temp files in globalStorage that
    // trigger save events but disappear immediately → ENOENT.
    const filePath = document.fileName.replace(/\\/g, "/");
    const BLOCKED_PATH_SEGMENTS = [
      "globalStorage",       // extension temp files (Blackbox, etc.)
      "workspaceStorage",    // VS Code workspace state blobs
      "/Code/User/",         // VS Code user-data directory (non-project)
      "extensionStorage",    // generic extension storage
      ".vscode/extensions",  // installed extension bundles
    ];
    const blockedSegment = BLOCKED_PATH_SEGMENTS.find(seg => filePath.includes(seg));
    if (blockedSegment) {
      outputChannel.appendLine(`[Save] Blocked path (${blockedSegment}): ${document.fileName}`);
      return;
    }

    // ── Guard 3: Only supported languages ──
    const supportedLanguages = [
      "javascript", "typescript", "javascriptreact", "typescriptreact",
      "python", "java", "go", "rust", "c", "cpp", "csharp", "php", "ruby",
    ];

    if (!supportedLanguages.includes(document.languageId)) {
      outputChannel.appendLine(`[Save] Skipping unsupported language: ${document.languageId}`);
      return;
    }

    const debounceMs = config.get<number>("debounceMs", 2000);
    const uri = document.uri.toString();
    const fileName = document.fileName.split(/[\\/]/).pop() || document.fileName;

    outputChannel.appendLine(`[Save] ${fileName} saved (${document.languageId}) — debouncing ${debounceMs}ms`);
    statusBarItem.text = "$(clock) SentinelAI: queued...";

    // Clear existing timer
    const existing = debounceTimers.get(uri);
    if (existing) {
      clearTimeout(existing);
    }


    const timer = setTimeout(() => {
      debounceTimers.delete(uri);
      runAnalysis(document).catch((err) => {
        outputChannel.appendLine(`[Error] Unhandled: ${err}`);
      });
    }, debounceMs);

    debounceTimers.set(uri, timer);
  });

  context.subscriptions.push(disposable);
  outputChannel.appendLine("[Init] Save handler registered. Save any supported file to trigger analysis.");
}

export async function runAnalysis(
  document: vscode.TextDocument,
  selectionCode?: string,
  startLineOffset: number = 0
): Promise<void> {
  const config = vscode.workspace.getConfiguration("sentinelai");
  const maxLines = config.get<number>("maxLines", 200);
  const agents = config.get<string[]>("agents", ["security", "complexity", "smell"]) as AgentType[];
  const apiUrl = config.get<string>("apiUrl", "http://localhost:3000");

  const fileName = document.fileName.split(/[\\/]/).pop() || document.fileName;

  // Extract code
  let code: string;
  let language: string;

  if (selectionCode) {
    code = selectionCode;
    language = document.languageId;
    outputChannel.appendLine(`[Analysis] Running on SELECTION from ${fileName}`);
  } else {
    const extracted = extractFile(document, maxLines);
    code = extracted.code;
    language = extracted.language;
    startLineOffset = extracted.startLine;
    outputChannel.appendLine(`[Analysis] Running on FILE: ${fileName} (${document.lineCount} lines, lang=${language})`);
  }

  if (!code.trim()) {
    outputChannel.appendLine(`[Analysis] Skipping — file is empty`);
    return;
  }

  // Check client-side cache
  const cached = resultCache.get(code, language, agents);
  if (cached) {
    outputChannel.appendLine(`[Cache] HIT — ${cached.length} issues (skipping API call)`);
    updateDiagnostics(document, cached, startLineOffset);
    setLatestIssues(document.uri, cached);
    setStatusBarResult(cached.length, "cache", 0);
    return;
  }

  // Show analyzing status
  outputChannel.appendLine(`[API] POST ${apiUrl}/api/analyze — agents: [${agents.join(", ")}]`);
  statusBarItem.text = "$(loading~spin) SentinelAI: analyzing...";
  statusBarItem.tooltip = "Running AI analysis...";

  const startTime = Date.now();

  try {
    const response = await analyzeCode({ code, language, analysisType: agents });

    const elapsed = Date.now() - startTime;
    outputChannel.appendLine(`[API] Response received in ${elapsed}ms — model: ${response.model}`);
    outputChannel.appendLine(`[API] Issues found: ${response.issues.length}`);

    response.issues.forEach((issue, i) => {
      outputChannel.appendLine(
        `  [${i + 1}] [${issue.severity.toUpperCase()}] [${issue.agent}] Line ${issue.line + 1}: ${issue.message} (${issue.rule})`
      );
    });

    // Cache + update UI
    resultCache.set(code, language, agents, response.issues);
    updateDiagnostics(document, response.issues, startLineOffset);
    setLatestIssues(document.uri, response.issues);
    setStatusBarResult(response.issues.length, response.model, response.latency);

    // Show a notification the FIRST time so user knows it's working
    if (!hasShownFirstSuccess) {
      hasShownFirstSuccess = true;
      const msg = response.issues.length > 0
        ? `SentinelAI found ${response.issues.length} issue(s) in ${fileName}. Check the Problems panel (Ctrl+Shift+M).`
        : `SentinelAI: No issues found in ${fileName} ✓`;
      vscode.window.showInformationMessage(msg, "Open Output").then((choice) => {
        if (choice === "Open Output") {
          outputChannel.show();
        }
      });
    }

  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`[ERROR] ${elapsed}ms — ${message}`);

    statusBarItem.text = "$(error) SentinelAI: error";
    statusBarItem.tooltip = message;

    // Always show error so it's not silent
    vscode.window.showErrorMessage(message, "Open Output", "Open Settings").then((choice) => {
      if (choice === "Open Output") { outputChannel.show(); }
      if (choice === "Open Settings") {
        vscode.commands.executeCommand("workbench.action.openSettings", "sentinelai");
      }
    });

    setTimeout(() => {
      statusBarItem.text = "$(shield) SentinelAI";
      statusBarItem.tooltip = "SentinelAI — Click to open summary";
    }, 8000);
  }
}

function setStatusBarResult(issueCount: number, model: string, latency: number): void {
  if (issueCount > 0) {
    const errors = issueCount;
    statusBarItem.text = `$(shield) SentinelAI: ${errors} issue${errors !== 1 ? "s" : ""}`;
    statusBarItem.tooltip = `SentinelAI — ${errors} issue(s) found | ${latency}ms | ${model}`;
  } else {
    statusBarItem.text = "$(shield) SentinelAI ✓";
    statusBarItem.tooltip = `SentinelAI — No issues | ${latency}ms | ${model}`;
    setTimeout(() => {
      statusBarItem.text = "$(shield) SentinelAI";
    }, 4000);
  }
}
