/**
 * Groq API Client
 * Uses Groq's OpenAI-compatible endpoint for fast inference.
 * Model: llama-3.3-70b-versatile — Groq's best free model (128k context, superior JSON output).
 */

interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GroqResponse {
  choices: Array<{
    message: {
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function callGroq(
  messages: GroqMessage[],
  options: {
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
  } = {}
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === "your_groq_key_here") {
    throw new Error("GROQ_API_KEY is not configured. Get one at https://console.groq.com");
  }

  const { temperature = 0.1, maxTokens = 4096, jsonMode = true } = options;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(jsonMode && { response_format: { type: "json_object" } }),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errorText}`);
  }

  const data: GroqResponse = await response.json();
  return data.choices[0]?.message?.content ?? "";
}
