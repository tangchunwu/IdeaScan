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
  if ([301, 302, 307, 308, 403, 404, 405, 429].includes(status)) return true;
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

  throw new Error(`llm_all_endpoints_failed:${errors.join(" | ").slice(0, 1200)}`);
}

export function extractAssistantContent(payload: any): string {
  return String(payload?.choices?.[0]?.message?.content || "");
}
