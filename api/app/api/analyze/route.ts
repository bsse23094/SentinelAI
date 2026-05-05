/**
 * POST /api/analyze
 *
 * Main API route for SentinelAI code analysis.
 * Chains security, complexity, and smell agents based on request.
 * Includes SHA-256 caching to avoid re-analyzing identical code.
 */

import { NextRequest, NextResponse } from "next/server";
import { runSecurityAgent } from "./agents/securityAgent";
import { runComplexityAgent } from "./agents/complexityAgent";
import { runSmellAgent } from "./agents/smellAgent";
import type { AnalyzeRequest, AnalyzeResponse, Issue } from "./types";
import crypto from "crypto";

// In-memory cache: Map<sha256, Issue[]>
const cache = new Map<string, { issues: Issue[]; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function computeHash(code: string, language: string, agents: string[]): string {
  const payload = `${code}|${language}|${agents.sort().join(",")}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function cleanCache(): void {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Sentinel-Secret",
    },
  });
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Optional: validate API secret
    const secret = request.headers.get("X-Sentinel-Secret");
    const expectedSecret = process.env.SENTINEL_API_SECRET;
    if (expectedSecret && expectedSecret !== "pick_any_random_string" && secret !== expectedSecret) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body: AnalyzeRequest = await request.json();

    // Validate request
    if (!body.code || typeof body.code !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'code' field" },
        { status: 400 }
      );
    }

    const language = body.language || "javascript";
    const analysisType = body.analysisType || ["security", "complexity", "smell"];

    // Check cache
    const hash = computeHash(body.code, language, analysisType);
    const cached = cache.get(hash);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      const latency = Date.now() - startTime;
      const response: AnalyzeResponse = {
        issues: cached.issues,
        model: "cache",
        latency,
      };
      return NextResponse.json(response);
    }

    // Run requested agents in parallel and tolerate single-agent failures.
    const agentRuns: Array<{
      name: "security" | "complexity" | "smell";
      model: string;
      run: Promise<Issue[]>;
    }> = [];

    if (analysisType.includes("security")) {
      agentRuns.push({
        name: "security",
        model: "llama-3.3-70b-versatile",
        run: runSecurityAgent(body.code, language),
      });
    }

    if (analysisType.includes("complexity")) {
      agentRuns.push({
        name: "complexity",
        model: "claude-haiku",
        run: runComplexityAgent(body.code, language),
      });
    }

    if (analysisType.includes("smell")) {
      agentRuns.push({
        name: "smell",
        model: "llama-3.3-70b-versatile",
        run: runSmellAgent(body.code, language),
      });
    }

    const settled = await Promise.allSettled(agentRuns.map((agent) => agent.run));

    const allIssues: Issue[] = [];
    const successfulModels: string[] = [];
    const failedAgents: string[] = [];

    settled.forEach((result, index) => {
      const agent = agentRuns[index];

      if (result.status === "fulfilled") {
        allIssues.push(...result.value);
        successfulModels.push(agent.model);
        return;
      }

      failedAgents.push(agent.name);
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.warn(`[/api/analyze] Agent '${agent.name}' failed: ${reason}`);
    });

    if (allIssues.length === 0 && failedAgents.length === agentRuns.length) {
      throw new Error(`All analysis agents failed: ${failedAgents.join(", ")}`);
    }

    // Store successful full responses only. Partial failures are likely transient.
    if (failedAgents.length === 0) {
      cache.set(hash, { issues: allIssues, timestamp: Date.now() });
    }

    // Periodic cleanup
    if (cache.size > 100) {
      cleanCache();
    }

    const latency = Date.now() - startTime;
    const response: AnalyzeResponse = {
      issues: allIssues,
      model:
        failedAgents.length > 0
          ? `${successfulModels.join(", ")} (failed: ${failedAgents.join(",")})`
          : successfulModels.join(", "),
      latency,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[/api/analyze] Error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
