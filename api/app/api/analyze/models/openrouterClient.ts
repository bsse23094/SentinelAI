/**
 * OpenRouter API Client
 * Uses OpenRouter's OpenAI-compatible endpoint for deep analysis
 * with models like Claude Haiku or DeepSeek.
 */

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const MODELS = {
  "claude-haiku": "anthropic/claude-haiku-4.5",
  deepseek: "deepseek/deepseek-chat",
} as const;

export type OpenRouterModel = keyof typeof MODELS;

export async function callOpenRouter(
  messages: OpenRouterMessage[],
  options: {
    model?: OpenRouterModel;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
  } = {}
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === "your_openrouter_key_here") {
    throw new Error(
      "OPENROUTER_API_KEY is not configured. Get one at https://openrouter.ai"
    );
  }

  const {
    model = "claude-haiku",
    temperature = 0.1,
    maxTokens = 4096,
    jsonMode = true,
  } = options;

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://sentinelai.dev",
        "X-Title": "SentinelAI",
      },
      body: JSON.stringify({
        model: MODELS[model],
        messages,
        temperature,
        max_tokens: maxTokens,
        ...(jsonMode && { response_format: { type: "json_object" } }),
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
  }

  const data: OpenRouterResponse = await response.json();
  return data.choices[0]?.message?.content ?? "";
}
