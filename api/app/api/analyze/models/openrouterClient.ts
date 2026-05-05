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

interface OpenRouterErrorPayload {
  error?: {
    message?: string;
  };
}

const MODELS = {
  "claude-haiku": "anthropic/claude-haiku-4.5",
  deepseek: "deepseek/deepseek-chat",
} as const;

export type OpenRouterModel = keyof typeof MODELS;

const DEFAULT_MAX_TOKENS = Number(process.env.OPENROUTER_MAX_TOKENS ?? 2048);
const MIN_RETRY_MAX_TOKENS = 128;

function getAffordableTokenLimit(errorText: string): number | null {
  // Example: "can only afford 3646"
  const match = errorText.match(/can only afford\s+(\d+)/i);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function sendOpenRouterRequest(payload: Record<string, unknown>, apiKey: string) {
  return fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://sentinelai.dev",
      "X-Title": "SentinelAI",
    },
    body: JSON.stringify(payload),
  });
}

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
    maxTokens = DEFAULT_MAX_TOKENS,
    jsonMode = true,
  } = options;

  const payload: Record<string, unknown> = {
    model: MODELS[model],
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(jsonMode && { response_format: { type: "json_object" } }),
  };

  let response = await sendOpenRouterRequest(payload, apiKey);

  if (!response.ok && response.status === 402) {
    const errorText = await response.text();
    const affordableLimit = getAffordableTokenLimit(errorText);

    if (affordableLimit && affordableLimit >= MIN_RETRY_MAX_TOKENS && affordableLimit < maxTokens) {
      payload.max_tokens = affordableLimit;
      response = await sendOpenRouterRequest(payload, apiKey);
    } else {
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    let providerMessage = errorText;

    try {
      const parsed: OpenRouterErrorPayload = JSON.parse(errorText);
      if (parsed.error?.message) {
        providerMessage = parsed.error.message;
      }
    } catch {
      // Keep raw errorText when provider response is not JSON.
    }

    throw new Error(`OpenRouter API error (${response.status}): ${providerMessage}`);
  }

  const data: OpenRouterResponse = await response.json();
  return data.choices[0]?.message?.content ?? "";
}
