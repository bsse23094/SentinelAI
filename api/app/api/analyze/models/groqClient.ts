/**
 * Groq API Client
 * Primary model: llama-3.3-70b-versatile (best quality, 100K TPD free tier)
 * Fallback model: llama-3.1-8b-instant (fast, separate quota)
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

// Ordered list of models to try. Each has its own per-day quota.
const GROQ_MODEL_CHAIN = [
  "llama-3.3-70b-versatile",  // Best quality
  "llama-3.1-8b-instant",     // Fast, lighter, separate quota
  "gemma2-9b-it",             // Google Gemma, another separate quota
];

async function callGroqModel(
  model: string,
  messages: GroqMessage[],
  options: {
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    apiKey: string;
  }
): Promise<string> {
  const { temperature = 0.1, maxTokens = 2048, jsonMode = true, apiKey } = options;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
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

  let lastError: unknown;

  for (const model of GROQ_MODEL_CHAIN) {
    try {
      const result = await callGroqModel(model, messages, { ...options, apiKey });
      if (model !== GROQ_MODEL_CHAIN[0]) {
        console.info(`[groqClient] Used fallback model: ${model}`);
      }
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // Only continue to next model on rate-limit errors (429)
      if (msg.includes("429")) {
        console.warn(`[groqClient] ${model} rate-limited, trying next model...`);
        lastError = error;
        continue;
      }
      // Any other error (auth, network, etc.) — propagate immediately
      throw error;
    }
  }

  // All Groq models exhausted
  throw lastError ?? new Error("All Groq models exhausted");
}
