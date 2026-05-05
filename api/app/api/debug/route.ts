/**
 * Temporary debug endpoint — remove after fixing.
 * Tests Groq API key connectivity from Vercel runtime with real prompts.
 */
import { NextResponse } from "next/server";

export async function GET() {
  const groqKey = process.env.GROQ_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  // Test actual security agent style call
  let groqTest: { ok: boolean; status?: number; body?: string; error?: string } = { ok: false };
  try {
    const systemPrompt = `You are SentinelAI's Security Agent — an expert code security auditor.
Return a JSON object with an "issues" array. If no issues, return {"issues": []}.
IMPORTANT: Return ONLY valid JSON. No markdown, no code fences, no extra text.`;
    
    const userPrompt = `Analyze this tsx code for security issues:\n\`\`\`tsx\nexport default function Page() { return <div>hello</div>; }\n\`\`\`\nReturn your analysis as a JSON object with an "issues" array.`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 2048,
        response_format: { type: "json_object" },
      }),
    });
    const body = await res.text();
    groqTest = { ok: res.ok, status: res.status, body: body.slice(0, 500) };
  } catch (e) {
    groqTest = { ok: false, error: String(e) };
  }

  // Test import resolution
  let importTest: { ok: boolean; error?: string } = { ok: false };
  try {
    const { runSecurityAgent } = await import("../analyze/agents/securityAgent");
    const issues = await runSecurityAgent("export default function Page() { return <div>hello</div>; }", "tsx");
    importTest = { ok: true, issueCount: issues.length } as any;
  } catch (e) {
    importTest = { ok: false, error: String(e) };
  }

  return NextResponse.json({
    keyStatus: {
      groq: groqKey ? groqKey.startsWith("gsk_") ? "looks valid" : `bad prefix: ${groqKey.slice(0, 6)}` : "MISSING",
      openrouter: openrouterKey ? "set" : "MISSING",
    },
    groqTest,
    importTest,
  });
}
