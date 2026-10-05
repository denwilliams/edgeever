import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { buildAiTagSuggestionRequest, parseAiTagSuggestionNames, type AiProvider } from "@edgeever/shared";
export { parseAiTagSuggestionNames } from "@edgeever/shared";
import { generateText, streamText } from "ai";

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
export const openAiMaxCompletionTokensFetch: typeof fetch = (input, init) => {
  if (typeof init?.body === "string") {
    try {
      const body = JSON.parse(init.body);
      if (body && typeof body === "object" && "max_tokens" in body && !("max_completion_tokens" in body)) {
        const { max_tokens, ...rest } = body;
        return fetch(input, { ...init, body: JSON.stringify({ ...rest, max_completion_tokens: max_tokens }) });
      }
    } catch {
      // Non-JSON bodies pass through untouched.
    }
  }
  return fetch(input, init);
};

export const createAiModel = (config: {
  provider: AiProvider;
  baseUrl: string;
  apiKey: string;
  modelId: string;
}) => {
  switch (config.provider) {
    case "anthropic":
      return createAnthropic({ baseURL: config.baseUrl, apiKey: config.apiKey })(config.modelId);
    case "google":
      return createGoogle({ baseURL: config.baseUrl, apiKey: config.apiKey })(config.modelId);
    default:
      return createOpenAICompatible({
        name: "edgeever-openai-compatible",
        baseURL: config.baseUrl,
        apiKey: config.apiKey,
        includeUsage: true,
        headers: openaiCompatibleHeaders(config.baseUrl),
        ...(isOpenAiBaseUrl(config.baseUrl) ? { fetch: openAiMaxCompletionTokensFetch } : {}),
      })(config.modelId);
  }
};

export const generateAiText = (...args: Parameters<typeof generateText>) => generateText(...args);

export const streamAiText = (...args: Parameters<typeof streamText>) => streamText(...args);

export const generateAiTagSuggestionNames = async (input: {
  model: ReturnType<typeof createAiModel>;
  instruction: string;
  title: string;
  contentMarkdown: string;
  currentTags: string[];
  existingTags: string[];
  locale?: string;
  abortSignal?: AbortSignal;
}) => {
  const fields = buildAiTagSuggestionRequest(input);
  const result = await generateText({
    model: input.model,
    system: fields.system,
    prompt: fields.prompt,
    maxOutputTokens: fields.maxOutputTokens,
    temperature: fields.temperature,
    abortSignal: input.abortSignal,
  });

  return parseAiTagSuggestionNames(result.text);
};
