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

  return {
    title: "请求失败",
    description: message || "发生未知错误，请稍后重试。",
    isNetworkError: false,
  };
}
