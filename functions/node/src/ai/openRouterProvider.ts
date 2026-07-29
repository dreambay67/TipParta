import { openRouterApiKeySecret, secretValue } from "../secrets.js";
import type { RecapProvider, RecapProviderRequest, RecapProviderResult } from "./recapGenerator.js";

type OpenRouterProviderOptions = {
  apiKey: string;
  role?: "daily" | "ticker";
  model?: string;
  fallbackModel?: string;
  webSearch?: {
    enabled: boolean;
    maxResults?: number;
    includeDomains?: string[];
  };
  fetchImpl?: typeof fetch;
};

type OpenRouterChoice = {
  finish_reason?: unknown;
  native_finish_reason?: unknown;
  message?: {
    content?: unknown;
    reasoning?: unknown;
  };
};

type OpenRouterResponse = {
  choices?: OpenRouterChoice[];
  error?: {
    message?: unknown;
  };
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_FLASH_MODEL = "deepseek/deepseek-v4-flash";
const DEFAULT_DAILY_MODEL = DEFAULT_FLASH_MODEL;
const DEFAULT_DAILY_FALLBACK_MODEL = DEFAULT_FLASH_MODEL;
const DEFAULT_TICKER_MODEL = DEFAULT_FLASH_MODEL;
const DEFAULT_TICKER_FALLBACK_MODEL = DEFAULT_FLASH_MODEL;
const DEFAULT_DAILY_MAX_TOKENS = 1400;
const DEFAULT_TICKER_MAX_TOKENS = 850;

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function modelNames(model: string, fallbackModel?: string): string[] {
  return unique([model, fallbackModel ?? ""]);
}

function webPlugins(webSearch: OpenRouterProviderOptions["webSearch"]): Array<Record<string, unknown>> | undefined {
  if (!webSearch?.enabled) {
    return undefined;
  }

  const includeDomains = unique(webSearch.includeDomains ?? []);

  return [
    {
      id: "web",
      max_results:
        typeof webSearch.maxResults === "number" && Number.isFinite(webSearch.maxResults)
          ? Math.max(1, Math.min(5, Math.trunc(webSearch.maxResults)))
          : 2,
      ...(includeDomains.length > 0 ? { include_domains: includeDomains } : {}),
      search_prompt:
        "Find concise, reliable match-story facts for the matches named in the prompt. Prefer official tournament sources and match reports; use trusted secondary reporting only when official coverage lacks a useful narrative detail. Extract only directly useful facts such as late goals, penalties, red cards, cancellations, upsets, comebacks, decisive scorers, or unusual match texture. If no useful fact exists, say so briefly. Do not invent player names or events."
    }
  ];
}

async function providerError(response: Response): Promise<Error> {
  let body: OpenRouterResponse | null = null;

  try {
    body = (await response.json()) as OpenRouterResponse;
  } catch {
    body = null;
  }

  const message = typeof body?.error?.message === "string" ? body.error.message : await response.text().catch(() => "");
  return new Error(`OpenRouter request failed (${response.status})${message ? `: ${message}` : ""}`);
}

function textFromContentPart(part: unknown): string | undefined {
  if (!part || typeof part !== "object") {
    return undefined;
  }

  const data = part as { text?: unknown; content?: unknown };
  if (typeof data.text === "string" && data.text.trim().length > 0) {
    return data.text.trim();
  }

  if (typeof data.content === "string" && data.content.trim().length > 0) {
    return data.content.trim();
  }

  return undefined;
}

function responseText(body: OpenRouterResponse): string {
  if (typeof body.error?.message === "string" && body.error.message.trim().length > 0) {
    throw new Error(body.error.message.trim());
  }

  const choice = body.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === "string" && content.trim().length > 0) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const text = content.map(textFromContentPart).filter((part): part is string => Boolean(part)).join("\n").trim();
    if (text.length > 0) {
      return text;
    }
  }

  const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : "unknown";
  const nativeFinishReason =
    typeof choice?.native_finish_reason === "string" ? choice.native_finish_reason : "unknown";
  const reasoning = typeof choice?.message?.reasoning === "string" && choice.message.reasoning.trim().length > 0;
  throw new Error(
    `OpenRouter response did not include text content (finish_reason=${finishReason}, native_finish_reason=${nativeFinishReason}, reasoning=${reasoning ? "present" : "missing"}).`
  );
}

export function createOpenRouterRecapProvider({
  apiKey,
  role = "daily",
  model,
  fallbackModel,
  webSearch,
  fetchImpl = fetch
}: OpenRouterProviderOptions): RecapProvider {
  const primaryModel = model ?? (role === "ticker" ? DEFAULT_TICKER_MODEL : DEFAULT_DAILY_MODEL);
  const secondaryModel =
    fallbackModel ?? (role === "ticker" ? DEFAULT_TICKER_FALLBACK_MODEL : DEFAULT_DAILY_FALLBACK_MODEL);
  const plugins = webPlugins(webSearch);
  const maxTokens = role === "ticker" ? DEFAULT_TICKER_MAX_TOKENS : DEFAULT_DAILY_MAX_TOKENS;

  return async function openRouterProvider(request: RecapProviderRequest): Promise<RecapProviderResult> {
    let lastError: Error | null = null;

    for (const modelName of modelNames(primaryModel, secondaryModel)) {
      try {
        const response = await fetchImpl(OPENROUTER_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://app.tipparta.fun",
            "X-Title": "TipParta MS 26"
          },
          body: JSON.stringify({
            model: modelName,
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.user }
            ],
            ...(plugins ? { plugins } : {}),
            temperature: 0.65,
            top_p: 0.9,
            max_tokens: maxTokens
          })
        });

        if (!response.ok) {
          throw await providerError(response);
        }

        const body = (await response.json()) as OpenRouterResponse;
        return { text: responseText(body) };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError ?? new Error("OpenRouter provider failed.");
  };
}

function envModel(role: "daily" | "ticker"): { model: string; fallbackModel: string } {
  const safeModel = (value: string | undefined, fallback: string): string => {
    if (!value || value.includes("v4-pro")) {
      return fallback;
    }

    return value;
  };

  if (role === "ticker") {
    return {
      model: safeModel(process.env.OPENROUTER_MODEL_TICKER_PRIMARY, DEFAULT_TICKER_MODEL),
      fallbackModel: safeModel(process.env.OPENROUTER_MODEL_TICKER_FALLBACK, DEFAULT_TICKER_FALLBACK_MODEL)
    };
  }

  return {
    model: safeModel(process.env.OPENROUTER_MODEL_DAILY_PRIMARY, DEFAULT_DAILY_MODEL),
    fallbackModel: safeModel(process.env.OPENROUTER_MODEL_DAILY_FALLBACK, DEFAULT_DAILY_FALLBACK_MODEL)
  };
}

function envWebSearch(): OpenRouterProviderOptions["webSearch"] {
  const enabled = process.env.AI_WEB_STORY_ENABLED !== "false";
  const includeDomains = (process.env.AI_WEB_INCLUDE_DOMAINS ?? "")
    .split(",")
    .map((domain) => domain.trim())
    .filter(Boolean);
  const maxResults = Number(process.env.AI_WEB_MAX_RESULTS ?? 2);

  return {
    enabled,
    includeDomains,
    maxResults: Number.isFinite(maxResults) ? maxResults : 2
  };
}

export function openRouterRecapProviderFromEnv(role: "daily" | "ticker" = "daily"): RecapProvider | undefined {
  if (process.env.AI_ANNOTATOR_ENABLED !== "true") {
    return undefined;
  }

  const apiKey = secretValue(openRouterApiKeySecret, "OPENROUTER_API_KEY");
  if (!apiKey) {
    return undefined;
  }

  const models = envModel(role);

  return createOpenRouterRecapProvider({
    apiKey,
    role,
    model: models.model,
    fallbackModel: models.fallbackModel,
    webSearch: envWebSearch()
  });
}
