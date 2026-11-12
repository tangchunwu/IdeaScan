export type ChatCompletionRequest = {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  /** GPT-6 reasoning effort. GPT-6.1 Sol/Astra require at least low. */
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max";
  /** Provider-specific Chat Completions fields, for example Perplexity search options. */
  extraBody?: Record<string, unknown>;
  redirect?: RequestRedirect;
  timeoutMs?: number;
  responseFormat?: { type: "json_object" };
};

export type ChatCompletionResponse = {
  endpoint: string;
  status: number;
  json: any;
  rawText: string;
};

function safeLower(text: string): string {
  return String(text || "").trim().toLowerCase();
}

export function normalizeLlmBaseUrl(input?: string): string {
  const raw = String(input || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/i, "")
    .replace(/(?:\/v1){2,}$/i, "/v1");
  try {
    const url = new URL(raw);
    if (/^api\.openai\.com$/i.test(url.hostname) && (url.pathname === "" || url.pathname === "/")) {
      url.pathname = "/v1";
      return url.toString().replace(/\/$/, "");
    }
  } catch {
    // buildChatCompletionEndpoints will return an invalid URL error later.
  }
  return raw;
}

export function buildChatCompletionEndpoints(baseUrl: string): string[] {
  const normalized = normalizeLlmBaseUrl(baseUrl);
  if (!normalized) return [];

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return [];
  }

  const path = parsed.pathname.replace(/\/+$/, "");
  const endpoints: string[] = [];
  const push = (value: string) => {
    if (value && !endpoints.includes(value)) endpoints.push(value);
  };
  const appendPath = (pathname: string): string => {
    const next = new URL(parsed.toString());
    next.pathname = `${pathname || ""}/chat/completions`.replace(/\/+/g, "/");
    return next.toString().replace(/\/$/, "");
  };

  // If URL contains /anthropic, the user likely meant the Anthropic-compat endpoint.
  // Auto-derive the OpenAI-compat endpoint by trying multiple common patterns.
  if (/\/anthropic(\/|$)/i.test(path)) {
    // Most proxies (OneAPI / NewAPI) expose OpenAI at /v1
    const openaiBase = normalized.replace(/\/anthropic(\/.*)?$/i, "/v1");
    push(`${openaiBase}/chat/completions`);
    // Some proxies nest it under the anthropic path with /v1
    push(`${normalized}/v1/chat/completions`);
    // Root-level fallback (no prefix)
    push(`${parsed.origin}/chat/completions`);
    push(`${parsed.origin}/v1/chat/completions`);
  }

  const normalizedPath = path === "/" ? "" : path;
  const hasV1Suffix = /\/v1$/i.test(normalizedPath);
  push(appendPath(normalizedPath));

  // Providers differ on whether their configured Base URL includes `/v1`.
  // Always try the alternate form, while preserving any custom path prefix.
  if (hasV1Suffix) {
    push(appendPath(normalizedPath.replace(/\/v1$/i, "")));
  } else {
    push(appendPath(`${normalizedPath}/v1`));
  }

  return endpoints;
}

/** GPT-6 models reject temperature/top_p whenever reasoning is enabled. */
export function isGpt6ReasoningModel(model: string): boolean {
  return /^gpt-6(?:\.\d+)?-(?:astra|sol|terra|luna)$/i.test(String(model || "").trim());
}

export function usesMaxCompletionTokens(model: string): boolean {
  const m = String(model || "").trim().toLowerCase();
  return isGpt6ReasoningModel(m) || /^gpt-6/.test(m) || /^gpt-5/.test(m) || /^o\d/.test(m);
}

/** Build a provider-compatible Chat Completions payload in one place. */
export function buildChatCompletionBody(req: ChatCompletionRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
  };
  // OpenAI reasoning models (GPT-6, GPT-5, o-series) reject max_tokens.
  if (usesMaxCompletionTokens(req.model)) body.max_completion_tokens = req.maxTokens ?? 800;
  else body.max_tokens = req.maxTokens ?? 800;

  if (isGpt6ReasoningModel(req.model)) {
    // GPT-6.1 Sol and GPT-6 Astra do not support "none". Low is the
    // conservative default and callers can explicitly request more effort.
    const requested = req.reasoningEffort;
    body.reasoning_effort = requested && requested !== "none" ? requested : "low";
  } else {
    body.temperature = req.temperature ?? 0.3;
    if (req.reasoningEffort) body.reasoning_effort = req.reasoningEffort;
  }

  if (req.responseFormat) body.response_format = req.responseFormat;
  if (req.extraBody) Object.assign(body, req.extraBody);
  return body;
}

function shouldTryNextEndpoint(status: number, contentType: string, bodyText: string): boolean {
  const ct = safeLower(contentType);
  const body = safeLower(bodyText).slice(0, 120);
  if (ct.includes("text/html")) return true;
  if (body.startsWith("<!doctype") || body.startsWith("<html")) return true;
  if ([301, 302, 307, 308, 401, 403, 404, 405, 429].includes(status)) return true;
  if (status >= 500) return true;
  return false;
}

function parseJsonOrThrow(rawText: string): any {
  try {
    return JSON.parse(rawText || "{}");
  } catch {
    throw new Error(`invalid_json_response:${rawText.slice(0, 200)}`);
  }
}

export async function requestChatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
  const timeoutMsTotal = Math.max(8000, Number(req.timeoutMs || 45000));
  const endpoints = buildChatCompletionEndpoints(req.baseUrl);
  if (endpoints.length === 0) {
    throw new Error("invalid_llm_base_url");
  }
  console.log(`[llm-client] Trying ${endpoints.length} endpoints for base=${req.baseUrl}: ${endpoints.join(", ")}`);
  const timeoutMsPerEndpoint = Math.max(6000, Math.floor(timeoutMsTotal / Math.max(1, endpoints.length)));

  const errors: string[] = [];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${req.apiKey}`,
          "Content-Type": "application/json",
        },
        redirect: req.redirect,
        body: JSON.stringify(buildChatCompletionBody(req)),
        signal: AbortSignal.timeout(timeoutMsPerEndpoint),
      });

      const rawText = await response.text();
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok) {
        const safeRawText = req.apiKey ? rawText.split(req.apiKey).join("[REDACTED_API_KEY]") : rawText;
        const reason = `http_${response.status}:${safeRawText.slice(0, 160)}`;
        errors.push(`${endpoint} -> ${reason}`);
        if (shouldTryNextEndpoint(response.status, contentType, rawText)) continue;
        throw new Error(reason);
      }

      const json = parseJsonOrThrow(rawText);
      return {
        endpoint,
        status: response.status,
        json,
        rawText,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${endpoint} -> ${msg.slice(0, 180)}`);
    }
  }

  console.log(`[llm-client] All endpoints failed: ${errors.join(" | ")}`);
  throw new Error(`llm_all_endpoints_failed:${errors.join(" | ").slice(0, 1200)}`);
}

export function extractAssistantContent(payload: any): string {
  return String(payload?.choices?.[0]?.message?.content || "");
}

export type UserLLMConfig = {
  llmApiKey?: string;
  llmBaseUrl?: string;
  llmModel?: string;
};

const OFFICIAL_OPENAI_HOST = /api\.openai\.com/i;

/**
 * 官方 OpenAI 地址只有在用户没有填写 Key 时才算"未配置"。
 * 用户填了 Key，就必须实际使用用户配置，不能静默换成服务端配置。
 */
export function fallsBackToServerLLM(config?: UserLLMConfig): boolean {
  const apiKey = String(config?.llmApiKey || "").trim();
  const baseUrl = String(config?.llmBaseUrl || "").trim();
  return OFFICIAL_OPENAI_HOST.test(baseUrl) && !apiKey;
}

export type UsableUserLLMConfig = UserLLMConfig & {
  llmApiKey: string;
  llmBaseUrl: string;
};

/** 用户自己填写的模型配置：Key 与 Base URL 都要有实际内容，空白值不算已配置。 */
export function hasUsableUserLLM(config?: UserLLMConfig): config is UsableUserLLMConfig {
  const apiKey = String(config?.llmApiKey || "").trim();
  const baseUrl = String(config?.llmBaseUrl || "").trim();
  return !!apiKey && !!baseUrl;
}
