/**
 * SentinelAI Extension Entry Point
 *
 * Registers all commands, providers, and triggers.
 * The extension activates on supported language files and provides:
 * - Inline diagnostics (squiggles)
 * - Hover explanations
 * - Code action quick-fixes
 * - Sidebar summary panel
 * - Auto-analysis on save
 */

import * as vscode from "vscode";
import { initDiagnosticProvider, clearAllDiagnostics } from "./providers/diagnosticProvider";
import { SentinelHoverProvider, clearIssues } from "./providers/hoverProvider";
import { SentinelCodeActionProvider } from "./providers/codeActionProvider";
import { SentinelSidebarProvider } from "./sidebar/webviewPanel";
import { initSaveHandler, runAnalysis, getOutputChannel } from "./triggers/saveHandler";
import { extractFile, extractSelection } from "./extraction/codeExtractor";
import { resultCache } from "./cache/resultCache";

// Supported language selectors
const SUPPORTED_LANGUAGES = [
  "javascript",
  "typescript",
  "javascriptreact",
  "typescriptreact",
  "python",
  "java",
  "go",
  "rust",
  "c",
  "cpp",
  "csharp",
  "php",
  "ruby",
];

const DOCUMENT_SELECTOR: vscode.DocumentSelector = SUPPORTED_LANGUAGES.map(
  (lang) => ({ language: lang, scheme: "file" })
);

export function activate(context: vscode.ExtensionContext): void {
  console.log("SentinelAI extension activated");

  // ── Initialize Diagnostic Collection ──
  initDiagnosticProvider(context);

  // ── Register Hover Provider ──
  const hoverProvider = new SentinelHoverProvider();
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(DOCUMENT_SELECTOR, hoverProvider)
  );

  // ── Register Code Action Provider ──
  const codeActionProvider = new SentinelCodeActionProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      DOCUMENT_SELECTOR,
      codeActionProvider,
      {
        providedCodeActionKinds: SentinelCodeActionProvider.providedCodeActionKinds,
      }
    )
  );

  // ── Register Sidebar Webview ──
  const sidebarProvider = new SentinelSidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SentinelSidebarProvider.viewType,
      sidebarProvider
    )
  );

  // ── Initialize Save Handler + Output Channel ──
  initSaveHandler(context);

  // Reveal the SentinelAI output channel immediately so user can see logs
  const out = getOutputChannel();
  out.appendLine("");
  out.appendLine("✅ SentinelAI activated successfully");
  out.appendLine(`   API URL : ${vscode.workspace.getConfiguration("sentinelai").get("apiUrl", "http://localhost:3000")}`);
  out.appendLine(`   Agents  : ${vscode.workspace.getConfiguration("sentinelai").get("agents", ["security", "complexity", "smell"])}`);
  out.appendLine(`   Debounce: ${vscode.workspace.getConfiguration("sentinelai").get("debounceMs", 2000)}ms`);
  out.appendLine("");
  out.appendLine("👉 Save any .js/.ts/.py file to trigger analysis.");
  out.appendLine("   Files in globalStorage/AppData are automatically ignored.");
  out.show(true); // true = don't steal focus

  // ── Register Commands ──

  // Analyze File
  context.subscriptions.push(
    vscode.commands.registerCommand("sentinelai.analyzeFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("SentinelAI: No active file to analyze.");
        return;
      }

      const config = vscode.workspace.getConfiguration("sentinelai");
      const maxLines = config.get<number>("maxLines", 200);
      const extracted = extractFile(editor.document, maxLines);

      await runAnalysis(editor.document, extracted.code, extracted.startLine);
      sidebarProvider.updateContent();
    })
  );

  // Analyze Selection
  context.subscriptions.push(
    vscode.commands.registerCommand("sentinelai.analyzeSelection", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("SentinelAI: No active file to analyze.");
        return;
      }

      const extracted = extractSelection(editor.document, editor.selection);
      if (!extracted) {
        vscode.window.showWarningMessage(
          "SentinelAI: No text selected. Select code to analyze."
        );
        return;
      }

      await runAnalysis(editor.document, extracted.code, extracted.startLine);
      sidebarProvider.updateContent();
    })
  );

  // Clear Diagnostics
  context.subscriptions.push(
    vscode.commands.registerCommand("sentinelai.clearDiagnostics", () => {
      clearAllDiagnostics();
      clearIssues();
      resultCache.clear();
      sidebarProvider.updateContent();
      vscode.window.showInformationMessage("SentinelAI: Diagnostics cleared.");
    })
  );

  // Open Summary
  context.subscriptions.push(
    vscode.commands.registerCommand("sentinelai.openSummary", () => {
      vscode.commands.executeCommand("sentinelai.summaryView.focus");
    })
  );

  // ── Scan Workspace ──
  context.subscriptions.push(
    vscode.commands.registerCommand("sentinelai.scanWorkspace", async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage("SentinelAI: No workspace folder is open.");
        return;
      }

      const config = vscode.workspace.getConfiguration("sentinelai");
      const maxFiles = config.get<number>("maxWorkspaceFiles", 50);
      const excludePatterns = config.get<string[]>("excludePatterns", [
        "**/node_modules/**", "**/dist/**", "**/out/**", "**/build/**",
        "**/.git/**", "**/coverage/**", "**/__pycache__/**",
      ]);

      // Build a single exclude glob from the array
      const excludeGlob = `{${excludePatterns.join(",")}}`;

      out.appendLine("\n═══════════════════════════════════════");
      out.appendLine("🔍 SentinelAI: Workspace Scan Starting");
      out.appendLine("═══════════════════════════════════════");

      // Discover all supported source files
      const includeGlob = "**/*.{js,ts,jsx,tsx,py,java,go,rs,c,cpp,cs,php,rb}";
      let allFiles: vscode.Uri[];
      try {
        allFiles = await vscode.workspace.findFiles(includeGlob, excludeGlob);
      } catch (err) {
        vscode.window.showErrorMessage(`SentinelAI: Failed to find files — ${err}`);
        return;
      }

      // Filter out VS Code internal paths (same guards as save handler)
      const BLOCKED = ["globalStorage", "workspaceStorage", "/Code/User/", ".vscode/extensions"];
      const userFiles = allFiles.filter(uri => {
        const p = uri.fsPath.replace(/\\/g, "/");
        return !BLOCKED.some(b => p.includes(b));
      });

      if (userFiles.length === 0) {
        vscode.window.showInformationMessage("SentinelAI: No supported source files found in workspace.");
        return;
      }

      const filesToScan = userFiles.slice(0, maxFiles);
      out.appendLine(`   Found ${userFiles.length} files — scanning ${filesToScan.length} (limit: ${maxFiles})`);
      if (userFiles.length > maxFiles) {
        out.appendLine(`   ⚠ ${userFiles.length - maxFiles} files skipped — raise "sentinelai.maxWorkspaceFiles" to scan more`);
      }

      let scanned = 0;
      let failed = 0;

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "SentinelAI: Scanning workspace",
          cancellable: true,
        },
        async (progress, token) => {
          for (let i = 0; i < filesToScan.length; i++) {
            if (token.isCancellationRequested) {
              out.appendLine("\n[Scan] ⛔ Cancelled by user.");
              break;
            }

            const fileUri = filesToScan[i];
            const fileName = fileUri.fsPath.split(/[\\/]/).pop() ?? fileUri.fsPath;

            progress.report({
              increment: 100 / filesToScan.length,
              message: `${fileName} (${i + 1}/${filesToScan.length})`,
            });

            try {
              // Open document using VS Code's model — never reads disk directly
              const document = await vscode.workspace.openTextDocument(fileUri);
              await runAnalysis(document);
              scanned++;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              out.appendLine(`   ⚠ Failed: ${fileName} — ${msg}`);
              failed++;
            }

            // Brief pause so we don't hammer the API sequentially
            await new Promise<void>(r => setTimeout(r, 200));
          }
        }
      );

      // Summary
      out.appendLine(`\n[Scan] ✅ Complete — ${scanned} files analyzed, ${failed} failed`);
      out.appendLine(`[Scan] Total issues: check the Problems panel (Ctrl+Shift+M)`);
      sidebarProvider.updateContent();

      const msg = `SentinelAI scan complete: ${scanned} files analyzed.`;
      vscode.window.showInformationMessage(msg, "Open Problems", "Open Output").then(choice => {
        if (choice === "Open Problems") {
          vscode.commands.executeCommand("workbench.action.problems.focus");
        }
        if (choice === "Open Output") {
          out.show();
        }
      });
    })
  );

  // ── Update sidebar when active editor changes ──
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      sidebarProvider.updateContent();
    })
  );
}

export function deactivate(): void {
  console.log("SentinelAI extension deactivated");
}
