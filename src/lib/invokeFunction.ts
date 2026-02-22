import { supabase } from "@/integrations/supabase/client";

type InvokeOptions = {
  method?: "POST" | "GET" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
};

const jwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const sanitizeToken = (token?: string | null) => {
  const raw = (token || "").trim();
  if (!raw) return "";
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).trim();
  }
  return raw.replace(/\r?\n/g, "").trim();
};
const isJwtLike = (token?: string | null) => jwtPattern.test(sanitizeToken(token));
const authInvalidPattern = /invalid jwt|jwt.*expired|expired.*jwt|invalid or expired session|auth session missing|authentication required/i;
const projectRefPattern = /^https?:\/\/([a-z0-9-]+)\.supabase\.co/i;

type JwtPayload = {
  exp?: number;
  iss?: string;
  ref?: string;
  aud?: string | string[];
  role?: string;
};

const getCurrentProjectRef = () => {
  const baseUrl = String(import.meta.env.VITE_SUPABASE_URL || "");
  const matched = baseUrl.match(projectRefPattern);
  return matched?.[1] || "";
};

const isAuthBypassEnabled = () => {
  const raw = String(import.meta.env.VITE_DISABLE_APP_AUTH || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
};

function decodeJwtPayload(token?: string | null): JwtPayload | null {
  const safeToken = sanitizeToken(token);
  if (!isJwtLike(safeToken)) return null;
  const payloadPart = safeToken.split(".")[1];
  if (!payloadPart) return null;
  try {
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const json = atob(padded);
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as JwtPayload;
  } catch {
    return null;
  }
}

function extractProjectRefFromPayload(payload: JwtPayload | null): string {
  if (!payload) return "";
  if (typeof payload.ref === "string" && payload.ref.trim()) {
    return payload.ref.trim();
  }
  if (typeof payload.iss === "string") {
    const matched = payload.iss.match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
    if (matched?.[1]) return matched[1];
  }
  return "";
}

function isTokenExpiringSoon(payload: JwtPayload | null, skewSeconds = 30): boolean {
  if (!payload || typeof payload.exp !== "number") return false;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= (now + skewSeconds);
}

function looksLikeInvalidAuth(errorLike: unknown): boolean {
  if (!errorLike || typeof errorLike !== "object") return false;
  const e = errorLike as Record<string, unknown>;
  const status = Number(e.status ?? e.statusCode ?? e.code ?? 0);
  const message = String(e.message ?? e.error_description ?? e.error ?? "");
  if (status === 401 && authInvalidPattern.test(message)) return true;
  if (status === 401 && message.toLowerCase().includes("jwt")) return true;
  return authInvalidPattern.test(message);
}

async function invokeViaSdk<T = any>(
  functionName: string,
  options: InvokeOptions = {},
): Promise<{ data: T | null; error: { message: string; status?: number } | null }> {
  const invokeFn = (supabase.functions as any)?.invoke;
  if (typeof invokeFn !== "function") {
    return { data: null, error: { message: "SDK invoke unavailable" } };
  }
  const method = options.method || "POST";
  const { data, error } = await invokeFn.call(supabase.functions, functionName, {
    method,
    body: options.body,
    headers: options.headers || {},
  });
  if (error) {
    const status = Number((error as any)?.context?.status ?? (error as any)?.status ?? 0) || undefined;
    return {
      data: (data as T) ?? null,
      error: {
        message: (error as any)?.message || "Edge Function returned a non-2xx status code",
        status,
      },
    };
  }
  return { data: (data as T) ?? null, error: null };
}

async function safeRefreshSession() {
  const refreshFn = (supabase.auth as any).refreshSession;
  if (typeof refreshFn !== "function") {
    return { data: { session: null }, error: new Error("refreshSession unavailable") };
  }
  const result = await refreshFn.call(supabase.auth);
  if (!result || typeof result !== "object") {
    return { data: { session: null }, error: new Error("refreshSession invalid result") };
  }
  return {
    data: (result as any).data ?? { session: null },
    error: (result as any).error ?? null,
  };
}

async function ensureAuthedAccessToken(initialToken: string): Promise<string | null> {
  let token = sanitizeToken(initialToken);
  const currentRef = getCurrentProjectRef();

  for (let attempt = 0; attempt < 3; attempt++) {
    if (!isJwtLike(token)) {
      const nonJwtUserResult = await supabase.auth.getUser(token);
      if (!nonJwtUserResult.error && nonJwtUserResult.data.user) {
        return token;
      }
      const refreshed = await safeRefreshSession();
      const refreshedToken = sanitizeToken(refreshed.data?.session?.access_token);
      if (isJwtLike(refreshedToken)) {
        token = refreshedToken;
        continue;
      }
      return null;
    }

    const payload = decodeJwtPayload(token);
    const tokenRef = extractProjectRefFromPayload(payload);
    if ((currentRef && tokenRef && currentRef !== tokenRef) || isTokenExpiringSoon(payload)) {
      const refreshed = await safeRefreshSession();
      const refreshedToken = sanitizeToken(refreshed.data?.session?.access_token);
      if (isJwtLike(refreshedToken)) {
        token = refreshedToken;
        continue;
      }
      return null;
    }

    const userResult = await supabase.auth.getUser(token);
    if (!userResult.error && userResult.data.user) {
      return token;
    }

    const refreshed = await safeRefreshSession();
    const refreshedToken = sanitizeToken(refreshed.data?.session?.access_token);
    if (!refreshed.error && isJwtLike(refreshedToken) && refreshedToken !== token) {
      token = refreshedToken;
      continue;
    }

    if (looksLikeInvalidAuth(userResult.error)) {
      return null;
    }
  }

  return null;
}

/**
 * Supabase Edge Function invoke helper.
 * For public calls (requireAuth=false), send only apikey by default to avoid
 * passing a stale/invalid Bearer token that triggers `Invalid JWT`.
 */
export async function invokeFunction<T = any>(
  functionName: string,
  options: InvokeOptions = {},
  requireAuth = false,
) {
  const effectiveRequireAuth = requireAuth && !isAuthBypassEnabled();
  const { data: { session } } = await supabase.auth.getSession();
  let accessToken = sanitizeToken(session?.access_token);

  if (effectiveRequireAuth && !accessToken) {
    throw new Error("请先登录");
  }

  if (effectiveRequireAuth && accessToken) {
    const ensuredToken = await ensureAuthedAccessToken(accessToken);
    if (!ensuredToken) {
      throw new Error("登录态已失效，请重新登录");
    }
    accessToken = ensuredToken;
  }

  const callViaFetch = async (tokenOverride?: string) => {
    // === [拦截器] 本地开发直连 Crawler Service 绕过 Supabase 云网络 ===
    const isLocalDevelopment = import.meta.env.DEV || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (isLocalDevelopment && functionName.startsWith("crawler-")) {
      const localCrawlerApp = "http://127.0.0.1:8001";
      let method = options.method || "POST";
      let endpoint = "";
      let finalBody: any = options.body ? { ...(options.body as Record<string, unknown>) } : {};
      const sessionUserResp = await supabase.auth.getUser();
      const currentUserId = sessionUserResp.data?.user?.id || "";

      if (functionName === "crawler-health") {
        endpoint = "/health";
        method = "GET";
        finalBody = undefined;
      } else if (functionName === "crawler-auth-start") {
        endpoint = "/internal/v1/auth/sessions/start";
        finalBody.user_id = currentUserId;
      } else if (functionName === "crawler-auth-status") {
        const flowId = finalBody.flow_id;
        const manualConfirm = finalBody.manual_confirm ? "true" : "false";
        endpoint = `/internal/v1/auth/sessions/${flowId}?manual_confirm=${manualConfirm}`;
        method = "GET";
        finalBody = undefined;
      } else if (functionName === "crawler-auth-cancel") {
        const flowId = finalBody.flow_id;
        endpoint = `/internal/v1/auth/sessions/cancel/${flowId}`;
      } else if (functionName === "crawler-auth-sessions") {
        endpoint = `/internal/v1/auth/sessions/user/${currentUserId}`;
        method = "GET";
        finalBody = undefined;
      } else if (functionName === "crawler-auth-revoke") {
        endpoint = `/internal/v1/auth/sessions/revoke`;
        finalBody.user_id = currentUserId;
      } else if (functionName === "crawler-dispatch") {
        endpoint = "/internal/v1/crawl/jobs";
        finalBody.user_id = currentUserId;
      }

      if (endpoint) {
        try {
          const response = await fetch(`${localCrawlerApp}${endpoint}`, {
            method,
            headers: { "Content-Type": "application/json" },
            body: method === "GET" || finalBody === undefined ? undefined : JSON.stringify(finalBody),
          });
          const text = await response.text();
          let payload: any = null;
          if (text) {
            try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
          }
          if (!response.ok) {
            return {
              data: payload,
              error: { message: payload?.error || payload?.detail || `Local crawler error (${response.status})`, status: response.status }
            };
          }
          return { data: payload, error: null };
        } catch (e: any) {
          return {
            data: null,
            error: { message: `无法连接到本地爬虫服务 (127.0.0.1:8001): ${e.message}`, status: 503 }
          };
        }
      }
    }
    // === [拦截器结束] ===

    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    const fallbackToken = sanitizeToken(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
    const authToken = effectiveRequireAuth ? sanitizeToken(tokenOverride || accessToken) : "";
    const method = options.method || "POST";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    if (fallbackToken) headers.apikey = fallbackToken;
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }
    if (effectiveRequireAuth && !authToken) {
      return {
        data: null,
        error: {
          message: "登录态已失效，请重新登录",
          status: 401,
        },
      };
    }

    const response = await fetch(`${baseUrl}/functions/v1/${functionName}`, {
      method,
      headers,
      body: method === "GET" || options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const text = await response.text();
    let payload: any = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }
    }

    if (!response.ok) {
      return {
        data: payload,
        error: {
          message:
            payload?.message ||
            payload?.error ||
            `Edge Function returned a non-2xx status code (${response.status})`,
          status: response.status,
        },
      };
    }
    return { data: payload, error: null };
  };

  const call = async (tokenOverride?: string) => {
    // Always use explicit fetch headers to keep auth behavior deterministic.
    return callViaFetch(tokenOverride);
  };

  let { data, error } = await call();

  if (error && effectiveRequireAuth && Number((error as any)?.status) === 401) {
    const renewed = await ensureAuthedAccessToken(accessToken);
    if (renewed) {
      accessToken = renewed;
      const retry = await call(accessToken);
      data = retry.data;
      error = retry.error;
    }
  }

  if (error && effectiveRequireAuth && Number((error as any)?.status) === 401) {
    const shouldRetryWithoutAuth = looksLikeInvalidAuth(error);
    if (shouldRetryWithoutAuth) {
      const noAuthRetry = await callViaFetch("");
      if (!noAuthRetry.error) {
        return { data: noAuthRetry.data as T, error: null } as const;
      }
      // keep original 401 semantics if public retry still fails
    }
    // Fallback: let Supabase SDK attach/refresh auth internally.
    const sdkResult = await invokeViaSdk<T>(functionName, options);
    if (!sdkResult.error) {
      return { data: sdkResult.data as T, error: null } as const;
    }
    error = sdkResult.error as any;
  }

  if (error) {
    const message = (error as any)?.message || "Edge Function returned a non-2xx status code";
    const status = (error as any)?.context?.status ?? (error as any)?.status;
    const normalizedError = { status, message, ...(typeof data === "object" && data ? (data as Record<string, unknown>) : {}) };
    if (Number(status) === 401 && typeof window !== "undefined") {
      const anonPayload = decodeJwtPayload(sanitizeToken(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY));
      const accessPayload = decodeJwtPayload(accessToken);
      console.warn("[invokeFunction][401]", {
        functionName,
        requireAuth: effectiveRequireAuth,
        currentProjectRef: getCurrentProjectRef(),
        anonRef: extractProjectRefFromPayload(anonPayload),
        accessRef: extractProjectRefFromPayload(accessPayload),
        anonRole: anonPayload?.role ?? "",
        accessRole: accessPayload?.role ?? "",
        accessExp: accessPayload?.exp ?? 0,
        message,
      });
    }
    if (effectiveRequireAuth && looksLikeInvalidAuth(normalizedError)) {
      return {
        data,
        error: {
          message: "登录态已失效，请重新登录",
          status,
        },
      } as const;
    }
    return {
      data,
      error: {
        message,
        status,
      },
    } as const;
  }

  return { data: data as T, error: null } as const;
}
