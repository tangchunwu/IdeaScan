export type ChatCompletionRequest = {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
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
  return String(input || "")
    .trim()
    .replace(/\/$/, "")
    .replace(/\/chat\/completions$/i, "");
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

  push(`${normalized}/chat/completions`);

  // If user entered host root, many OpenAI-compatible providers require `/v1`.
  if (!path || path === "/") {
    push(`${normalized}/v1/chat/completions`);
  }

  // If user entered `/v1`, some proxy gateways expose root `/chat/completions`.
  if (path === "/v1") {
    push(`${parsed.origin}/chat/completions`);
  }

  return endpoints;
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
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          temperature: req.temperature ?? 0.3,
          max_tokens: req.maxTokens ?? 800,
          ...(req.responseFormat ? { response_format: req.responseFormat } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMsPerEndpoint),
      });

      const rawText = await response.text();
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok) {
        const reason = `http_${response.status}:${rawText.slice(0, 160)}`;
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
