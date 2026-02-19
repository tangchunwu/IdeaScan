import { ValidationError } from "./validation.ts";

type MinimalUser = {
  id: string;
  email?: string;
};

type ResolveUserResult = {
  user: MinimalUser;
  bypassed: boolean;
};

function isBypassEnabled() {
  const raw = String(Deno.env.get("DISABLE_APP_AUTH") || "").toLowerCase().trim();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

async function tryResolveRealUser(supabase: any, req: Request): Promise<MinimalUser | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return { id: data.user.id, email: data.user.email || "" };
}

async function resolveBypassUser(supabase: any): Promise<MinimalUser> {
  const envUserId = String(Deno.env.get("DEV_AUTH_USER_ID") || "").trim();
  if (envUserId) return { id: envUserId, email: "" };

  const listRes = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  const firstUser = listRes?.data?.users?.[0];
  if (firstUser?.id) return { id: firstUser.id, email: firstUser.email || "" };

  throw new ValidationError("BYPASS_AUTH_FAILED: no users found. Please create one auth user or set DEV_AUTH_USER_ID");
}

export async function resolveAuthUserOrBypass(supabase: any, req: Request): Promise<ResolveUserResult> {
  const realUser = await tryResolveRealUser(supabase, req);
  if (realUser) return { user: realUser, bypassed: false };

  if (!isBypassEnabled()) {
    throw new ValidationError("Invalid or expired session");
  }

  const bypassUser = await resolveBypassUser(supabase);
  return { user: bypassUser, bypassed: true };
}

