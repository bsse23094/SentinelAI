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

export async function callGroqWithOpenRouterFallback(
  messages: ModelMessage[],
  options: ModelCallOptions = {}
): Promise<string> {
  let groqError: unknown;

  try {
    return await callGroq(messages, options);
  } catch (error) {
    // Catch ALL Groq errors and attempt OpenRouter fallback.
    // Previously only 429 rate-limit errors were caught — any other
    // Groq failure (auth, network, model error) would re-throw and
    // kill the agent without ever trying OpenRouter.
    groqError = error;
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[modelFallback] Groq failed (${reason}), falling back to OpenRouter`);
  }

  try {
    return await callOpenRouter(messages, {
      ...options,
      model: "claude-haiku",
    });
  } catch (openRouterError) {
    const orReason = openRouterError instanceof Error ? openRouterError.message : String(openRouterError);
    const groqReason = groqError instanceof Error ? groqError.message : String(groqError);
    throw new Error(`Both providers failed. Groq: ${groqReason} | OpenRouter: ${orReason}`);
  }
}
