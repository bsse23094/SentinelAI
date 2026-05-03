import { callGroq } from "../models/groqClient";
import { callOpenRouter } from "../models/openrouterClient";

interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ModelCallOptions {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

function isGroqRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("Groq API error (429)");
}

export async function callGroqWithOpenRouterFallback(
  messages: ModelMessage[],
  options: ModelCallOptions = {}
): Promise<string> {
  try {
    return await callGroq(messages, options);
  } catch (error) {
    if (!isGroqRateLimitError(error)) {
      throw error;
    }

    return callOpenRouter(messages, {
      ...options,
      model: "claude-haiku",
    });
  }
}
