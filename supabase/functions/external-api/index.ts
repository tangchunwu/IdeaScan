import { authenticateExternalApiKeyValue, extractExternalApiKey } from "../_shared/external-api-key.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ideascan-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const baseUrl = () => `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

const openapi = {
  openapi: "3.1.0",
  info: { title: "IdeaScan API", version: "1.0.0", description: "用一个 IdeaScan API Key 挖掘国内/海外需求并执行需求验证。供应商密钥由系统配置池管理。" },
  servers: [{ url: `${Deno.env.get("SUPABASE_URL")}/functions/v1` }],
  security: [{ IdeaScanKey: [] }],
  paths: {
    "/external-api": {
      post: {
        operationId: "ideaScan",
        summary: "统一调用 IdeaScan 能力",
        security: [{ IdeaScanKey: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Request" } } } },
        responses: { "200": { description: "统一 JSON 响应", content: { "application/json": { schema: { $ref: "#/components/schemas/Response" } } } }, "401": { description: "API Key 无效" }, "429": { description: "超过每分钟限流" } },
      },
    },
  },
  components: {
    securitySchemes: { IdeaScanKey: { type: "apiKey", in: "header", name: "X-IdeaScan-Key", description: "在 API 配置中心创建的 is_live_... Key" } },
    schemas: {
      Request: {
        type: "object", required: ["operation"], properties: {
          operation: { type: "string", enum: ["discover_opportunities", "validate_idea"] },
          input: { type: "object", description: "discover_opportunities 使用 country/industry/keyword/platforms/mode；validate_idea 使用 idea/tags/config" },
        },
      },
      Response: { type: "object", required: ["success", "operation"], properties: { success: { type: "boolean" }, operation: { type: "string" }, data: { type: "object" }, error: { type: "object" } } },
    },
  },
};

async function callInternal(path: string, key: string, payload: unknown): Promise<Response> {
  return fetch(`${baseUrl()}${path}`, { method: "POST", headers: { "Content-Type": "application/json", "X-IdeaScan-Key": key }, body: JSON.stringify(payload) });
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method === "GET") return json({ success: true, type: "openapi", openapi });
  if (req.method !== "POST") return json({ success: false, error: { code: "method_not_allowed", message: "仅支持 GET/POST" } }, 405);
  const key = extractExternalApiKey(req);
  const body = await req.json().catch(() => null) as { operation?: string; input?: Record<string, unknown> } | null;
  if (!body || !body.operation) return json({ success: false, error: { code: "invalid_request", message: "缺少 operation" } }, 400);
  const scope = body.operation === "discover_opportunities" ? "opportunity:read" : body.operation === "validate_idea" ? "validation:run" : "";
  if (!scope) return json({ success: false, error: { code: "unsupported_operation", message: "支持 discover_opportunities 或 validate_idea" } }, 400);
  const auth = await authenticateExternalApiKeyValue(key, scope, false);
  if (!auth) return json({ success: false, error: { code: "unauthorized", message: "IdeaScan API Key 无效、已撤销或没有该 scope" } }, 401);
  const target = body.operation === "discover_opportunities" ? "/opportunity-discover" : "/validate-idea";
  const response = await callInternal(target, key, body.input || {});
  const raw = await response.text();
  let data: unknown;
  try { data = JSON.parse(raw); } catch { data = { raw: raw.slice(0, 1000) }; }
  return json({ success: response.ok, operation: body.operation, data: response.ok ? data : undefined, error: response.ok ? undefined : { code: `upstream_${response.status}`, message: typeof data === "object" && data && "error" in data ? (data as { error: string }).error : "调用失败" } }, response.ok ? 200 : response.status);
});
