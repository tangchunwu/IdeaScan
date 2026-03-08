export type UserFacingError = {
  title: string;
  description: string;
  isNetworkError?: boolean;
};

const NETWORK_ERROR_PATTERNS = [
  "Failed to fetch",
  "Failed to send a request to the Edge Function",
  "ERR_SSL_PROTOCOL_ERROR",
  "ERR_PROXY_CONNECTION_FAILED",
  "NetworkError",
  "Load failed",
];

/**
 * Maps common Edge Function / backend error messages to user-friendly Chinese copy.
 */
const FRIENDLY_ERROR_MAP: Array<{ pattern: string | RegExp; title: string; description: string }> = [
  { pattern: "quota exceeded", title: "配额已用完", description: "本月免费验证次数已耗尽，请在设置中配置个人 TikHub Token 或升级方案。" },
  { pattern: "rate limit", title: "操作过于频繁", description: "请稍等片刻后再试。" },
  { pattern: "Rate limit", title: "操作过于频繁", description: "请稍等片刻后再试。" },
  { pattern: "unauthorized", title: "登录已失效", description: "请刷新页面后重新登录。" },
  { pattern: "Unauthorized", title: "登录已失效", description: "请刷新页面后重新登录。" },
  { pattern: "JWT expired", title: "登录已过期", description: "请刷新页面后重新登录。" },
  { pattern: "invalid JWT", title: "登录凭证无效", description: "请重新登录后再试。" },
  { pattern: "timeout", title: "请求超时", description: "后端处理超时，请稍后重试。如果持续超时，可以尝试缩短想法描述或减少标签数量。" },
  { pattern: "Timeout", title: "请求超时", description: "后端处理超时，请稍后重试。" },
  { pattern: "CORS", title: "跨域请求被拒绝", description: "请刷新页面后重试。如果问题持续，请联系管理员。" },
  { pattern: "Internal Server Error", title: "服务器内部错误", description: "后端发生异常，请稍后重试。" },
  { pattern: "502", title: "服务暂时不可用", description: "后端网关异常，请稍等几秒后重试。" },
  { pattern: "503", title: "服务暂时不可用", description: "后端正在维护中，请稍后再试。" },
  { pattern: "504", title: "网关超时", description: "后端响应超时，请稍后重试。" },
  { pattern: /TikHub.*invalid/i, title: "TikHub Token 无效", description: "请检查设置中的 TikHub API Token 是否正确。" },
  { pattern: /TikHub.*expired/i, title: "TikHub Token 已过期", description: "请前往 TikHub 仪表板获取新的 Token。" },
  { pattern: "请先登录", title: "请先登录", description: "需要登录后才能使用此功能。" },
];

export function toUserFacingBackendError(err: unknown): UserFacingError {
  const message = err instanceof Error ? err.message : String(err ?? "");

  const isNetworkError = NETWORK_ERROR_PATTERNS.some((p) => message.includes(p));
  if (isNetworkError) {
    return {
      title: "网络连接失败",
      description:
        "当前网络/代理阻止了与后端通信（HTTPS/代理错误）。请关闭代理/抓包工具或换个网络后刷新再试。",
      isNetworkError: true,
    };
  }

  // Match known error patterns
  for (const entry of FRIENDLY_ERROR_MAP) {
    const matched =
      typeof entry.pattern === "string"
        ? message.includes(entry.pattern)
        : entry.pattern.test(message);
    if (matched) {
      return { title: entry.title, description: entry.description, isNetworkError: false };
    }
  }

  return {
    title: "请求失败",
    description: message || "发生未知错误，请稍后重试。",
    isNetworkError: false,
  };
}
