/**
 * Normalize a persona's role (which may be Chinese text) into a standard key.
 * Uses both role text and persona name for robust matching.
 */
export function normalizeRoleKey(role: string, name?: string): string {
  const r = (role || "").toLowerCase();
  const n = (name || "").toLowerCase();

  // VC / 投资人
  if (r.includes("vc") || r.includes("合伙人") || r.includes("投资") || n.includes("老徐") || n.includes("红杉")) {
    return "vc";
  }
  // PM / 产品经理
  if (r.includes("pm") || r.includes("产品") || n.includes("阿强")) {
    return "pm";
  }
  // User representative
  if (r.includes("user") || r.includes("用户") || r.includes("挑剔") || n.includes("可可") || n.includes("毒舌")) {
    return "user";
  }
  // Analyst
  if (r.includes("analyst") || r.includes("分析") || n.includes("老王")) {
    return "analyst";
  }

  // Legacy short codes
  if (["vc", "pm", "user", "analyst"].includes(r)) return r;

  return "analyst"; // default fallback
}

/** Get a short display label for a role */
export function getRoleLabel(role: string, name?: string): string {
  const key = normalizeRoleKey(role, name);
  const labels: Record<string, string> = {
    vc: "VC",
    pm: "PM",
    user: "用户",
    analyst: "分析师",
  };
  return labels[key] || "分析师";
}
