function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const parsed = new URL(trimmed);
  const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  const normalized = `${parsed.protocol}//${parsed.host}${pathname}`;
  return normalized;
}

function parseAllowedHostRules(defaultHost: string): string[] {
  const envRaw = Deno.env.get("CRAWLER_SERVICE_ALLOWED_HOSTS") || "";
  const rules = envRaw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (defaultHost) {
    rules.push(defaultHost.toLowerCase());
  }

  if (rules.length === 0) {
    rules.push("trycloudflare.com");
    rules.push("localhost.run");
  }
  rules.push("cenima.us.ci");
  return Array.from(new Set(rules));
}

function hostAllowed(hostname: string, rules: string[]): boolean {
  const value = hostname.toLowerCase();
  return rules.some((rule) => value === rule || value.endsWith(`.${rule}`));
}

function validateCandidate(urlValue: string, rules: string[]): string {
  const parsed = new URL(urlValue);
  if (parsed.protocol !== "https:") {
    throw new Error("crawler route must use https");
  }
  if (parsed.username || parsed.password) {
    throw new Error("crawler route must not include credentials");
  }
  if (!hostAllowed(parsed.hostname, rules)) {
    throw new Error("crawler route host not allowed");
  }
  return normalizeBaseUrl(urlValue);
}

export function resolveCrawlerServiceBaseUrl(preferredRaw: string | null | undefined): string {
  const defaultRaw = Deno.env.get("CRAWLER_SERVICE_BASE_URL") || "";
  const defaultNormalized = defaultRaw ? normalizeBaseUrl(defaultRaw) : "";
  const defaultHost = defaultNormalized ? new URL(defaultNormalized).hostname : "";
  const rules = parseAllowedHostRules(defaultHost);

  const preferred = (preferredRaw || "").trim();
  if (preferred) {
    try {
      return validateCandidate(preferred, rules);
    } catch {
      // fall through to default route
    }
  }

  if (!defaultNormalized) return "";
  return defaultNormalized;
}
