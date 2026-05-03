import * as vscode from "vscode";
import { analyzeCode } from "../api/client";
import { updateDiagnostics } from "../providers/diagnosticProvider";
import { setLatestIssues } from "../providers/hoverProvider";
import { resultCache } from "../cache/resultCache";
import type { AgentType } from "../types";

const RULE_MAP: Record<string, { emoji: string; title: string; what: string; fix: string }> = {
  "sql-injection": { emoji: "💀", title: "Database Takeover Risk", what: "User input is injected directly into a SQL query. An attacker can type magic characters to read, delete, or corrupt your entire database.", fix: "Use parameterized queries or an ORM like Prisma. Never concatenate user input into SQL strings." },
  "xss": { emoji: "🎭", title: "Attackers Can Fake Your UI", what: "User content is rendered as HTML without sanitization. Hackers can inject <script> tags that run in your users' browsers.", fix: "Sanitize all user data before injecting into the DOM. Use DOMPurify or your framework's built-in escaping." },
  "hardcoded-secrets": { emoji: "🔑", title: "Secret Key Exposed in Code", what: "A password or API key is hardcoded in the source. Anyone who reads your code or repo can steal it.", fix: "Move all secrets to a .env file, add .env to .gitignore, and rotate the exposed key NOW." },
  "hardcoded-secret": { emoji: "🔑", title: "Secret Key Exposed in Code", what: "A password or API key is hardcoded in the source. Anyone who reads your code or repo can steal it.", fix: "Move all secrets to a .env file, add .env to .gitignore, and rotate the exposed key NOW." },
  "code-injection": { emoji: "☠️", title: "Hackers Can Run Any Code", what: "eval() or similar is used with dynamic input. Attackers can execute arbitrary code on your server.", fix: "Remove eval() entirely. Use JSON.parse(), a strategy pattern, or a lookup table instead." },
  "eval-function": { emoji: "☠️", title: "eval() is a Security Nightmare", what: "eval() executes a string as JavaScript. It's unsafe, slow, and impossible to debug.", fix: "Delete eval(). Use JSON.parse(), dynamic imports, or a switch/case statement." },
  "deep-nesting": { emoji: "🌀", title: "Spaghetti Code — Too Many Levels", what: "Too many if/else or loops nested inside each other. Nearly impossible to read without getting lost.", fix: "Use early returns to exit fast. Extract inner logic into helper functions." },
  "long-parameter-list": { emoji: "📦", title: "Too Many Function Arguments", what: "Functions with 4+ parameters are confusing. Callers mix up the order and bugs hide easily.", fix: "Bundle related params into one object: function foo({ name, age, email }) instead." },
  "magic-numbers": { emoji: "🎲", title: "Mystery Numbers With No Explanation", what: "Numbers like 86400 or 0.075 are used directly. Nobody — including future you — will know what they mean.", fix: "Create named constants: const TAX_RATE = 0.075; and use those names instead." },
  "unused-function": { emoji: "👻", title: "Dead Code — Nobody Uses This", what: "This function is defined but never called. It wastes space and confuses readers.", fix: "Delete it. Version control will save it if you ever need it back." },
  "god-function": { emoji: "🐉", title: "Monster Function — Does Everything", what: "This function is responsible for too many things. Impossible to test or modify safely.", fix: "Break it into smaller focused functions. Each should do exactly ONE thing." },
};

function getFriendly(rule: string, agent: string) {
  return RULE_MAP[rule] ?? (
    agent === "security" ? { emoji: "🚨", title: "Security Vulnerability", what: "A security flaw was detected.", fix: "Review this code and use a more secure approach." } :
    agent === "complexity" ? { emoji: "🧠", title: "Complex Code", what: "This code is overly complex and hard to maintain.", fix: "Break it into smaller, clearer pieces." } :
    { emoji: "👃", title: "Code Smell", what: "A structural issue that makes maintenance harder.", fix: "Consider refactoring this section." }
  );
}

export class SentinelDashboardPanel {
  public static readonly viewType = "sentinelai.dashboard";
  public static currentPanel: SentinelDashboardPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _isScanning = false;

  public static createOrShow(): void {
    if (SentinelDashboardPanel.currentPanel) {
      SentinelDashboardPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      SentinelDashboardPanel.viewType, "🛡️ SentinelAI", vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    SentinelDashboardPanel.currentPanel = new SentinelDashboardPanel(panel);
  }

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this._panel.webview.html = this._getHtml();
    this._panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "scan" && !this._isScanning) await this._runScan();
      if (msg.type === "jumpToFile") await this._jumpToFile(msg.path, msg.line);
    }, null, this._disposables);
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  private _post(data: object) {
    this._panel.webview.postMessage(data);
  }

  private async _jumpToFile(filePath: string, line: number) {
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.Two);
      const pos = new vscode.Position(Math.max(0, line - 1), 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    } catch { /* ignore */ }
  }

  private async _runScan() {
    this._isScanning = true;
    const config = vscode.workspace.getConfiguration("sentinelai");
    const maxFiles = config.get<number>("maxWorkspaceFiles", 50);
    const excludePatterns = config.get<string[]>("excludePatterns", [
      "**/node_modules/**", "**/dist/**", "**/out/**", "**/build/**",
      "**/.git/**", "**/coverage/**", "**/__pycache__/**",
    ]);
    const excludeGlob = `{${excludePatterns.join(",")}}`;
    const BLOCKED = ["globalStorage", "workspaceStorage", "/Code/User/"];

    let allFiles: vscode.Uri[];
    try {
      allFiles = await vscode.workspace.findFiles("**/*.{js,ts,jsx,tsx,py,java,go,rs,c,cpp,cs,php,rb}", excludeGlob);
    } catch (e) {
      this._post({ type: "error", message: String(e) });
      this._isScanning = false;
      return;
    }

    const userFiles = allFiles
      .filter(u => !BLOCKED.some(b => u.fsPath.replace(/\\/g, "/").includes(b)))
      .slice(0, maxFiles);

    if (userFiles.length === 0) {
      this._post({ type: "error", message: "No supported source files found in workspace." });
      this._isScanning = false;
      return;
    }

    this._post({ type: "scanStart", total: userFiles.length });

    const agents = config.get<AgentType[]>("agents", ["security", "complexity", "smell"]);
    const startTime = Date.now();

    for (let i = 0; i < userFiles.length; i++) {
      const fileUri = userFiles[i];
      const fileName = fileUri.fsPath.split(/[\\/]/).pop() ?? fileUri.fsPath;
      this._post({ type: "progress", current: i + 1, total: userFiles.length, fileName });

      try {
        const doc = await vscode.workspace.openTextDocument(fileUri);
        const code = doc.getText();
        if (!code.trim()) continue;

        const cached = resultCache.get(code, doc.languageId, agents);
        const issues = cached ?? (await analyzeCode({ code, language: doc.languageId, analysisType: agents })).issues;
        if (!cached) resultCache.set(code, doc.languageId, agents, issues);

        updateDiagnostics(doc, issues, 0);
        setLatestIssues(fileUri, issues);

        const enriched = issues.map((issue, idx) => {
          const info = getFriendly(issue.rule, issue.agent);
          return {
            id: `${i}_${idx}`,
            filePath: fileUri.fsPath,
            fileName,
            line: issue.line + 1,
            severity: issue.severity,
            agent: issue.agent,
            rule: issue.rule,
            emoji: info.emoji,
            title: info.title,
            what: info.what,
            fix: info.fix,
            message: issue.message,
          };
        });

        if (enriched.length > 0) {
          this._post({ type: "fileResult", fileName, filePath: fileUri.fsPath, issues: enriched });
        }
      } catch { /* skip unreadable files */ }

      await new Promise<void>(r => setTimeout(r, 150));
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    this._post({ type: "scanComplete", filesScanned: userFiles.length, duration });
    this._isScanning = false;
  }

  public dispose() {
    SentinelDashboardPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
  }

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SentinelAI</title>
<style>
  :root{--bg:#08091a;--surface:#0f1629;--surface2:#161f35;--card:#1a2440;--accent:#4ade80;--accent2:#22d3ee;--red:#f87171;--yellow:#fbbf24;--blue:#60a5fa;--purple:#a78bfa;--text:#f1f5f9;--muted:#64748b;--border:rgba(255,255,255,0.07)}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:-apple-system,'Segoe UI',sans-serif;min-height:100vh;overflow-x:hidden}
  /* Header */
  .header{background:linear-gradient(135deg,#0f172a 0%,#0d1f3c 100%);border-bottom:1px solid var(--border);padding:20px 28px;display:flex;align-items:center;gap:14px}
  .logo{font-size:32px;filter:drop-shadow(0 0 12px rgba(74,222,128,0.6))}
  .brand h1{font-size:22px;font-weight:700;background:linear-gradient(90deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-0.5px}
  .brand p{color:var(--muted);font-size:12px;margin-top:2px}
  /* Hero section */
  .hero{padding:40px 28px;text-align:center}
  .hero h2{font-size:28px;font-weight:800;margin-bottom:8px;line-height:1.2}
  .hero p{color:var(--muted);font-size:14px;max-width:480px;margin:0 auto 32px}
  /* Scan button */
  .scan-btn{background:linear-gradient(135deg,#16a34a,#0891b2);border:none;color:#fff;font-size:16px;font-weight:700;padding:16px 40px;border-radius:12px;cursor:pointer;display:inline-flex;align-items:center;gap:10px;transition:all 0.2s;box-shadow:0 0 30px rgba(74,222,128,0.25);letter-spacing:0.3px}
  .scan-btn:hover{transform:translateY(-2px);box-shadow:0 0 50px rgba(74,222,128,0.4)}
  .scan-btn:active{transform:translateY(0)}
  .scan-btn:disabled{opacity:0.5;cursor:not-allowed;transform:none}
  .scan-btn .spinner{width:18px;height:18px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  /* Progress */
  .progress-wrap{margin:24px auto;max-width:560px;display:none}
  .progress-wrap.visible{display:block}
  .progress-label{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:8px}
  .progress-bar{background:var(--surface2);border-radius:99px;height:8px;overflow:hidden}
  .progress-fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:99px;transition:width 0.3s ease;width:0%}
  .current-file{text-align:center;font-size:12px;color:var(--muted);margin-top:8px;font-family:monospace}
  /* Stats */
  .stats{display:flex;gap:12px;padding:0 28px 28px;justify-content:center;display:none}
  .stats.visible{display:flex}
  .stat{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 24px;flex:1;max-width:180px;text-align:center}
  .stat-num{font-size:32px;font-weight:800;line-height:1}
  .stat-lbl{font-size:11px;color:var(--muted);margin-top:4px;text-transform:uppercase;letter-spacing:0.5px}
  .stat.red .stat-num{color:var(--red)}
  .stat.yellow .stat-num{color:var(--yellow)}
  .stat.blue .stat-num{color:var(--blue)}
  .stat.green .stat-num{color:var(--accent)}
  /* Filters */
  .filters{display:none;gap:8px;padding:0 28px 20px;flex-wrap:wrap}
  .filters.visible{display:flex}
  .filter-btn{background:var(--surface);border:1px solid var(--border);color:var(--muted);padding:7px 16px;border-radius:99px;font-size:12px;cursor:pointer;transition:all 0.15s}
  .filter-btn.active{background:var(--surface2);border-color:var(--accent);color:var(--accent)}
  /* Issues */
  .issues{padding:0 28px 40px;display:flex;flex-direction:column;gap:12px}
  .file-group{background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden}
  .file-header{padding:12px 16px;background:var(--surface2);display:flex;align-items:center;gap:10px;font-size:13px;font-weight:600}
  .file-name{font-family:monospace;color:var(--accent2)}
  .issue-count-badge{background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.2);color:var(--accent);border-radius:99px;padding:2px 8px;font-size:11px;margin-left:auto}
  .issue-item{padding:14px 16px;border-top:1px solid var(--border);display:flex;gap:14px;align-items:flex-start;cursor:pointer;transition:background 0.15s}
  .issue-item:hover{background:var(--card)}
  .issue-emoji{font-size:22px;flex-shrink:0;margin-top:2px}
  .issue-body{flex:1;min-width:0}
  .issue-title{font-weight:700;font-size:14px;margin-bottom:4px}
  .issue-meta{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
  .badge{border-radius:6px;padding:2px 8px;font-size:11px;font-weight:600}
  .badge.security{background:rgba(248,113,113,0.15);color:var(--red)}
  .badge.complexity{background:rgba(251,191,36,0.15);color:var(--yellow)}
  .badge.smell{background:rgba(96,165,250,0.15);color:var(--blue)}
  .badge.error{background:rgba(248,113,113,0.1);color:var(--red);border:1px solid rgba(248,113,113,0.3)}
  .badge.warning{background:rgba(251,191,36,0.1);color:var(--yellow);border:1px solid rgba(251,191,36,0.3)}
  .badge.info{background:rgba(96,165,250,0.1);color:var(--blue);border:1px solid rgba(96,165,250,0.3)}
  .line-badge{font-family:monospace;font-size:11px;color:var(--muted)}
  /* Expandable detail */
  .issue-detail{display:none;margin-top:10px;background:rgba(0,0,0,0.2);border-radius:10px;padding:12px;font-size:12px;line-height:1.6}
  .issue-detail.open{display:block}
  .detail-section{margin-bottom:8px}
  .detail-label{font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:3px}
  .detail-text{color:#cbd5e1}
  .fix-text{color:var(--accent);font-weight:600}
  /* Jump button */
  .jump-btn{margin-top:10px;background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.25);color:var(--accent);padding:5px 12px;border-radius:7px;font-size:12px;cursor:pointer;transition:all 0.15s;font-weight:600}
  .jump-btn:hover{background:rgba(74,222,128,0.2)}
  /* Empty / success */
  .empty{text-align:center;padding:60px 28px;color:var(--muted)}
  .empty-icon{font-size:56px;margin-bottom:16px}
  .success-banner{background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.2);border-radius:14px;padding:20px;text-align:center;margin:0 28px 28px}
  .success-banner h3{color:var(--accent);font-size:18px;margin-bottom:4px}
  .success-banner p{color:var(--muted);font-size:13px}
  /* Error */
  .error-box{background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.25);border-radius:12px;padding:16px;margin:20px 28px;color:var(--red);font-size:13px}
</style>
</head>
<body>

<div class="header">
  <div class="logo">🛡️</div>
  <div class="brand">
    <h1>SentinelAI</h1>
    <p>Your AI Security Co-Pilot — built for vibe coders</p>
  </div>
</div>

<div class="hero">
  <h2>Scan. Detect. Ship safely. 🚀</h2>
  <p>One click analyzes every file in your codebase for security holes, messy code, and logic complexity — in plain English.</p>
  <button class="scan-btn" id="scanBtn" onclick="startScan()">
    <span id="btnIcon">🔍</span>
    <span id="btnText">SCAN MY CODEBASE</span>
  </button>
</div>

<div class="progress-wrap" id="progressWrap">
  <div class="progress-label">
    <span id="progressText">Starting...</span>
    <span id="progressPct">0%</span>
  </div>
  <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
  <div class="current-file" id="currentFile">—</div>
</div>

<div class="stats" id="stats">
  <div class="stat red"><div class="stat-num" id="critCount">0</div><div class="stat-lbl">🔴 Security</div></div>
  <div class="stat yellow"><div class="stat-num" id="warnCount">0</div><div class="stat-lbl">🟡 Complexity</div></div>
  <div class="stat blue"><div class="stat-num" id="infoCount">0</div><div class="stat-lbl">🔵 Code Smells</div></div>
  <div class="stat green"><div class="stat-num" id="fileCount">0</div><div class="stat-lbl">✅ Files Scanned</div></div>
</div>

<div class="filters" id="filters">
  <button class="filter-btn active" onclick="setFilter('all')">All Issues</button>
  <button class="filter-btn" onclick="setFilter('security')">🔴 Security</button>
  <button class="filter-btn" onclick="setFilter('complexity')">🧠 Complexity</button>
  <button class="filter-btn" onclick="setFilter('smell')">👃 Code Smells</button>
</div>

<div id="errorBox"></div>
<div class="issues" id="issuesList"></div>

<script>
const vscode = acquireVsCodeApi();
let allIssues = [];
let currentFilter = 'all';
let totalFiles = 0;
let scanning = false;

function startScan(){
  if(scanning) return;
  scanning = true;
  allIssues = [];
  document.getElementById('issuesList').innerHTML = '';
  document.getElementById('errorBox').innerHTML = '';
  document.getElementById('stats').classList.remove('visible');
  document.getElementById('filters').classList.remove('visible');
  document.getElementById('critCount').textContent='0';
  document.getElementById('warnCount').textContent='0';
  document.getElementById('infoCount').textContent='0';
  document.getElementById('fileCount').textContent='0';
  const btn = document.getElementById('scanBtn');
  btn.disabled = true;
  document.getElementById('btnIcon').innerHTML = '<div class="spinner"></div>';
  document.getElementById('btnText').textContent = 'Scanning...';
  vscode.postMessage({type:'scan'});
}

function setFilter(f){
  currentFilter=f;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  event.target.classList.add('active');
  renderIssues();
}

function renderIssues(){
  const list = document.getElementById('issuesList');
  const filtered = currentFilter==='all' ? allIssues : allIssues.filter(g=>g.agent===currentFilter);
  if(!filtered.length){
    list.innerHTML='<div class="empty"><div class="empty-icon">✨</div><p>No issues in this category!</p></div>';
    return;
  }
  list.innerHTML = filtered.map(group=>\`
    <div class="file-group" data-agent="\${group.agent}">
      <div class="file-header">
        <span>\${agentEmoji(group.agent)}</span>
        <span class="file-name">\${group.fileName}</span>
        <span class="issue-count-badge">\${group.issues.length} issue\${group.issues.length!==1?'s':''}</span>
      </div>
      \${group.issues.map(iss=>\`
        <div class="issue-item" onclick="toggleDetail('\${iss.id}')">
          <div class="issue-emoji">\${iss.emoji}</div>
          <div class="issue-body">
            <div class="issue-title">\${iss.title}</div>
            <div class="issue-meta">
              <span class="badge \${iss.agent}">\${iss.agent.toUpperCase()}</span>
              <span class="badge \${iss.severity}">\${iss.severity.toUpperCase()}</span>
              <span class="line-badge">Line \${iss.line}</span>
            </div>
            <div class="issue-detail" id="detail-\${iss.id}">
              <div class="detail-section">
                <div class="detail-label">🤔 What's happening?</div>
                <div class="detail-text">\${iss.what}</div>
              </div>
              <div class="detail-section">
                <div class="detail-label">✅ How to fix it</div>
                <div class="fix-text">\${iss.fix}</div>
              </div>
              <button class="jump-btn" onclick="jumpTo(event,'\${iss.filePath.replace(/\\\\/g,'/')}',\${iss.line})">Jump to Code →</button>
            </div>
          </div>
        </div>
      \`).join('')}
    </div>
  \`).join('');
}

function agentEmoji(a){return a==='security'?'🔴':a==='complexity'?'🟡':'🔵';}

function toggleDetail(id){
  const el=document.getElementById('detail-'+id);
  el.classList.toggle('open');
}

function jumpTo(e,path,line){
  e.stopPropagation();
  vscode.postMessage({type:'jumpToFile',path,line});
}

window.addEventListener('message',e=>{
  const msg=e.data;
  if(msg.type==='scanStart'){
    totalFiles=msg.total;
    document.getElementById('progressWrap').classList.add('visible');
  }
  if(msg.type==='progress'){
    const pct=Math.round((msg.current/msg.total)*100);
    document.getElementById('progressFill').style.width=pct+'%';
    document.getElementById('progressPct').textContent=pct+'%';
    document.getElementById('progressText').textContent=\`Scanning file \${msg.current} of \${msg.total}\`;
    document.getElementById('currentFile').textContent=msg.fileName;
  }
  if(msg.type==='fileResult'){
    // Group by agent within a file
    const byAgent={};
    msg.issues.forEach(iss=>{
      if(!byAgent[iss.agent]) byAgent[iss.agent]={agent:iss.agent,fileName:msg.fileName,filePath:msg.filePath,issues:[]};
      byAgent[iss.agent].issues.push(iss);
    });
    Object.values(byAgent).forEach(g=>allIssues.push(g));
    // Update counts
    const sec=allIssues.flatMap(g=>g.issues).filter(i=>i.agent==='security').length;
    const cmp=allIssues.flatMap(g=>g.issues).filter(i=>i.agent==='complexity').length;
    const sml=allIssues.flatMap(g=>g.issues).filter(i=>i.agent==='smell').length;
    document.getElementById('critCount').textContent=sec;
    document.getElementById('warnCount').textContent=cmp;
    document.getElementById('infoCount').textContent=sml;
    document.getElementById('stats').classList.add('visible');
    document.getElementById('filters').classList.add('visible');
    renderIssues();
  }
  if(msg.type==='scanComplete'){
    scanning=false;
    document.getElementById('progressWrap').classList.remove('visible');
    document.getElementById('fileCount').textContent=msg.filesScanned;
    const btn=document.getElementById('scanBtn');
    btn.disabled=false;
    document.getElementById('btnIcon').textContent='🔄';
    document.getElementById('btnText').textContent='SCAN AGAIN';
    if(!allIssues.length){
      document.getElementById('issuesList').innerHTML=\`
        <div class="success-banner">
          <h3>🎉 Your codebase is clean!</h3>
          <p>Scanned \${msg.filesScanned} files in \${msg.duration}s — no issues found.</p>
        </div>\`;
    }
  }
  if(msg.type==='error'){
    scanning=false;
    document.getElementById('btnIcon').textContent='🔍';
    document.getElementById('btnText').textContent='SCAN MY CODEBASE';
    document.getElementById('scanBtn').disabled=false;
    document.getElementById('progressWrap').classList.remove('visible');
    document.getElementById('errorBox').innerHTML=\`<div class="error-box">⚠️ \${msg.message}</div>\`;
  }
});
</script>
</body>
</html>`;
  }
}
