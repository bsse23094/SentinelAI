/**
 * API Client
 * Uses Node's built-in http/https modules (NOT fetch) for VS Code extension compatibility.
 * fetch is unreliable in the extension host process; http.request always works.
 */

import * as http from "http";
import * as https from "https";
import * as vscode from "vscode";
import { AnalyzeRequest, AnalyzeResponse } from "../types";


export function analyzeCode(request: AnalyzeRequest): Promise<AnalyzeResponse> {
  return new Promise((resolve, reject) => {
    const config = vscode.workspace.getConfiguration("sentinelai");
    const apiUrl = config.get<string>("apiUrl", "http://localhost:3000");
    const apiSecret = config.get<string>("apiSecret", "");

    
    let url: URL;
    try {
      url = new URL("/api/analyze", apiUrl);
    } catch {
      reject(new Error(`SentinelAI: Invalid API URL: "${apiUrl}"`));
      return;
    }

    const body = JSON.stringify(request);
    const isHttps = url.protocol === "https:";
    const defaultPort = isHttps ? 443 : 80;
    const port = url.port ? parseInt(url.port, 10) : defaultPort;

    const headers: Record<string, string | number> = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    };
    if (apiSecret) {
      headers["X-Sentinel-Secret"] = apiSecret;
    }

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port,
      path: url.pathname + url.search,
      method: "POST",
      headers,
    };

    const transport = isHttps ? https : http;

    const req = transport.request(options, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(
            new Error(
              `SentinelAI API error (${res.statusCode}): ${data.substring(0, 200)}`
            )
          );
          return;
        }
        try {
          const parsed = JSON.parse(data) as AnalyzeResponse;
          resolve(parsed);
        } catch {
          reject(
            new Error(`SentinelAI: Failed to parse API response: ${data.substring(0, 200)}`)
          );
        }
      });
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("SentinelAI: API request timed out after 30s"));
    });

    req.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ECONNREFUSED") {
        reject(
          new Error(
            `SentinelAI: Cannot connect to API at ${apiUrl}. ` +
            `Make sure the backend is running: cd api && npm run dev`
          )
        );
      } else {
        reject(new Error(`SentinelAI: Network error — ${error.message}`));
      }
    });

    req.write(body);
    req.end();
  });
}
