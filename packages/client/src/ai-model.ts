import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { AiProvider } from "@edgeever/shared";

export const openaiCompatibleHeaders = (baseUrl: string) => {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    if (host === "openrouter.ai" || host.endsWith(".openrouter.ai")) {
      return { "HTTP-Referer": "https://edgeever.org", "X-Title": "EdgeEver" };
    }
  } catch {
    // Invalid URLs are rejected by the provider factory.
  }
};

const isOpenAiBaseUrl = (baseUrl: string) => {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === "api.openai.com";
  } catch {
    return false;
  }
};

// OpenAI's newer models reject max_tokens in favour of max_completion_tokens, but the
// openai-compatible provider always sends max_tokens. Rewrite it for OpenAI only, since
// other compatible backends may still require max_tokens.
export const withOpenAiMaxCompletionTokens = (baseFetch: typeof fetch = (...args) => fetch(...args)): typeof fetch =>
  (input, init) => {
    if (typeof init?.body === "string") {
      try {
        const body = JSON.parse(init.body);
        if (body && typeof body === "object" && "max_tokens" in body && !("max_completion_tokens" in body)) {
          const { max_tokens, ...rest } = body;
          return baseFetch(input, { ...init, body: JSON.stringify({ ...rest, max_completion_tokens: max_tokens }) });
        }
      } catch {
        // Non-JSON bodies pass through untouched.
      }
    }
    return baseFetch(input, init);
  };

export const createClientAiModel = (config: {
  provider: AiProvider;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  fetch?: typeof fetch;
}) => {
  switch (config.provider) {
    case "anthropic":
      return createAnthropic({ baseURL: config.baseUrl, apiKey: config.apiKey, fetch: config.fetch })(config.modelId);
    case "google":
      return createGoogle({ baseURL: config.baseUrl, apiKey: config.apiKey, fetch: config.fetch })(config.modelId);
    default:
      return createOpenAICompatible({
        name: "edgeever-openai-compatible",
        baseURL: config.baseUrl,
        apiKey: config.apiKey,
        includeUsage: true,
        headers: openaiCompatibleHeaders(config.baseUrl),
        fetch: isOpenAiBaseUrl(config.baseUrl) ? withOpenAiMaxCompletionTokens(config.fetch) : config.fetch,
      })(config.modelId);
  }
};
