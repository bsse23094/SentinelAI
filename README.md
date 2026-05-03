<div align="center">
  <h1>🛡️ SentinelAI</h1>
  <p><strong>AI-Powered Security, Complexity, and Code Smell Analyzer for VS Code</strong></p>
  <p>
    <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version 1.0.0">
    <img src="https://img.shields.io/badge/VS%20Code-1.85%2B-blueviolet" alt="VS Code 1.85+">
    <img src="https://img.shields.io/badge/backend-Next.js-black" alt="Next.js">
  </p>
</div>

---

**SentinelAI** is an advanced, AI-driven Visual Studio Code extension that performs comprehensive real-time code analysis. Acting as an intelligent pair programmer, it continuously analyzes your codebase to detect security vulnerabilities, high cyclomatic complexity, and structural code smells. 

Instead of waiting for a CI/CD pipeline, SentinelAI catches issues **inline as you type**, directly within your editor.

## ✨ Features

- **🛡️ Security Agent**: Detects SQL injections, XSS vulnerabilities, hardcoded secrets, remote code execution (RCE) flaws, and unsafe `eval()` usage.
- **🧠 Complexity Agent**: Identifies deep nesting, god classes/functions, and overly complex logic that reduces maintainability.
- **👃 Code Smell Agent**: Highlights anti-patterns, magic numbers, duplicate code, and excessively long parameter lists.
- **🚀 Real-Time Inline Diagnostics**: Issues appear as standard VS Code squiggles directly on the problematic lines.
- **🛠️ One-Click Fixes**: Provides actionable, AI-generated "Quick Fixes" (via Code Actions) to resolve issues instantly.
- **🔍 Workspace Scanning**: Scan your entire project at once with the `SentinelAI: Scan Workspace` command.
- **⚡ High Performance**: Implements debounced auto-analysis on save, and SHA-256 caching on both the client and backend to ensure blazing fast response times (~0ms cache hits).

## 🏗️ Architecture

SentinelAI consists of two main components:
1. **VS Code Extension (`/extension`)**: A lightweight TypeScript client that interacts with the VS Code API (Diagnostics, Hover, Code Actions, Output Channels) and orchestrates code extraction.
2. **Analysis Backend (`/api`)**: A Next.js microservice utilizing Langchain-inspired parallel execution of LLM agents (powered by Groq and OpenRouter). Features automatic model fallback: if Groq is rate-limited (429), the system transparently falls back to OpenRouter without interrupting analysis.

### Supported Languages
JavaScript, TypeScript, Python, Java, Go, Rust, C, C++, C#, PHP, and Ruby.

## 🚀 Installation & Setup

### 1. Backend API Setup
The backend requires API keys from Groq (for the `llama-3.3-70b-versatile` model) and OpenRouter (for Claude Haiku).

```bash
# Navigate to the api directory
cd api

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
# Edit .env.local and add your GROQ_API_KEY and OPENROUTER_API_KEY

# Start the server
npm run dev
```
*The API will run on `http://localhost:3000`.*

### 2. Extension Installation
You can install the extension directly in VS Code by dragging and dropping the compiled `.vsix` file into the Extensions panel, or by running:

```bash
# Navigate to the extension directory
cd extension

# Install dependencies and package the extension
npm install
npm run package

# Install the generated .vsix in VS Code
code --install-extension sentinelai-0.1.0.vsix
```

## ⚙️ Configuration
Access SentinelAI settings in VS Code (`File > Preferences > Settings` and search for "SentinelAI"):

| Setting | Default | Description |
|---|---|---|
| `sentinelai.apiUrl` | `http://localhost:3000` | URL of your deployed SentinelAI backend. |
| `sentinelai.triggerOnSave` | `true` | Automatically run analysis when saving a file. |
| `sentinelai.debounceMs` | `2000` | Delay (in ms) before triggering analysis to prevent spam. |
| `sentinelai.maxWorkspaceFiles` | `50` | Max number of files to process when running a Workspace Scan. |
| `sentinelai.agents` | `["security", "complexity", "smell"]` | Which agents to execute during analysis. |

## 🕹️ Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):
- **`SentinelAI: Scan Workspace`**: Scans the entire open workspace with a progress bar.
- **`SentinelAI: Analyze File`**: Forces an immediate scan of the currently open file.
- **`SentinelAI: Analyze Selection`**: Scans only the highlighted text.
- **`SentinelAI: Clear Diagnostics`**: Clears all current SentinelAI squiggles and cache.
- **`SentinelAI: Open Summary`**: Opens the SentinelAI sidebar dashboard.

## 📝 Ignoring Rules
To suppress a specific warning for a line of code, add a comment:
```javascript
// sentinel-disable-next-line
const token = "hardcoded_secret_token_abc123";
```

## 📜 License
This project is licensed under the MIT License.
