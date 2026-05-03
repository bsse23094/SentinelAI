/**
 * Code Extractor
 * Extracts code from the active editor — either the full file,
 * a selection, or the enclosing function scope for large files.
 */

import * as vscode from "vscode";

export interface ExtractedCode {
  code: string;
  language: string;
  startLine: number; // 0-indexed offset from file start
}

/**
 * Extract the full file content, trimmed to maxLines if needed.
 */
export function extractFile(
  document: vscode.TextDocument,
  maxLines: number
): ExtractedCode {
  const totalLines = document.lineCount;
  let code: string;
  let startLine = 0;

  if (totalLines <= maxLines) {
    code = document.getText();
  } else {
    // Try to find the cursor position and extract around it
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document === document) {
      const cursorLine = editor.selection.active.line;
      const halfWindow = Math.floor(maxLines / 2);
      startLine = Math.max(0, cursorLine - halfWindow);
      const endLine = Math.min(totalLines - 1, startLine + maxLines - 1);
      startLine = Math.max(0, endLine - maxLines + 1);

      const range = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
      code = document.getText(range);
    } else {
      // No cursor context — take the first maxLines
      const endLine = Math.min(totalLines - 1, maxLines - 1);
      const range = new vscode.Range(0, 0, endLine, document.lineAt(endLine).text.length);
      code = document.getText(range);
    }
  }

  return {
    code,
    language: mapLanguageId(document.languageId),
    startLine,
  };
}

/**
 * Extract the currently selected text.
 */
export function extractSelection(
  document: vscode.TextDocument,
  selection: vscode.Selection
): ExtractedCode | null {
  if (selection.isEmpty) {
    return null;
  }

  const code = document.getText(selection);
  return {
    code,
    language: mapLanguageId(document.languageId),
    startLine: selection.start.line,
  };
}

/**
 * Map VS Code language IDs to more standard names for the AI prompts.
 */
function mapLanguageId(langId: string): string {
  const mapping: Record<string, string> = {
    javascript: "javascript",
    typescript: "typescript",
    javascriptreact: "jsx",
    typescriptreact: "tsx",
    python: "python",
    java: "java",
    go: "go",
    rust: "rust",
    c: "c",
    cpp: "cpp",
    csharp: "csharp",
    php: "php",
    ruby: "ruby",
  };

  return mapping[langId] || langId;
}
