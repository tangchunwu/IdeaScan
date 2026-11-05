export const EXTERNAL_API_KEY_PREFIX = "is_live_";

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function isExternalApiKey(value: string): boolean {
  return value.startsWith(EXTERNAL_API_KEY_PREFIX) && value.length >= 24;
}

export function extractExternalApiKey(req: Request): string {
  const headerKey = req.headers.get("x-ideascan-key")?.trim();
  if (headerKey) return headerKey;
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(\S+)$/i)?.[1] || "";
  return isExternalApiKey(token) ? token : "";
}

export async function hashExternalApiKey(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function createExternalApiKey(): Promise<{ rawKey: string; prefix: string; hash: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const rawKey = `${EXTERNAL_API_KEY_PREFIX}${base64Url(bytes)}`;
  return { rawKey, prefix: rawKey.slice(0, 16), hash: await hashExternalApiKey(rawKey) };
}
