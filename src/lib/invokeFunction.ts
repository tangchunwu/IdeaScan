import { supabase } from "@/integrations/supabase/client";

type InvokeOptions = {
  method?: "POST" | "GET" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
};

/**
 * Supabase Edge Function invoke helper.
 * Always sends Authorization header to avoid gateway-level 401 caused by missing auth header.
 */
export async function invokeFunction<T = any>(
  functionName: string,
  options: InvokeOptions = {},
  requireAuth = false,
) {
  const { data: { session } } = await supabase.auth.getSession();

  if (requireAuth && !session?.access_token) {
    throw new Error("请先登录");
  }

  const fallbackToken = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const authToken = session?.access_token || fallbackToken;
  const headers: Record<string, string> = {
    ...(options.headers || {}),
    Authorization: `Bearer ${authToken}`,
  };

  return supabase.functions.invoke<T>(functionName, {
    ...options,
    headers,
  });
}

