export const SITE_NAME = "IdeaScan - 创意验证器";
export const SITE_ORIGIN = "https://ideascan.me";
export const STATIC_SEO_PATHS = [
  "/", "/validate", "/discover", "/pricing", "/faq", "/privacy", "/terms",
  "/auth", "/auth/callback/linuxdo", "/history", "/compare", "/openclaw",
  "/content-studio", "/admin/models", "/admin/feedback", "/gallery",
];

export interface RouteSeo {
  title: string;
  description?: string;
  robots: "index, follow" | "noindex, nofollow";
}

const PUBLIC_DESCRIPTIONS: Record<string, string> = {
  "/": "抓取小红书真实用户痛点和全网竞品数据，用 AI 专家辩论帮助你判断创业想法是否值得做。",
  "/validate": "一句话描述你的创业想法，IdeaScan 自动抓取社媒数据和竞品情报，生成需求验证报告。",
  "/discover": "发现正在爆发的市场机会，追踪社媒热门话题和创业趋势。",
  "/pricing": "IdeaScan 定价方案，免费体验 AI 创业想法验证和市场洞察能力。",
  "/faq": "关于 IdeaScan AI 创业验证工具的常见问题解答。",
  "/privacy": "IdeaScan 隐私政策，了解我们如何保护您的数据和隐私。",
  "/terms": "IdeaScan 服务条款，使用本服务前请仔细阅读。",
};

const INDEXABLE_PATHS = new Set(Object.keys(PUBLIC_DESCRIPTIONS));

export const getDefaultDescription = (path: string) => PUBLIC_DESCRIPTIONS[path];

export const getDefaultRobots = (path: string): RouteSeo["robots"] => {
  return INDEXABLE_PATHS.has(path) || path.startsWith("/p/")
    ? "index, follow"
    : "noindex, nofollow";
};

export const getRouteSeo = (pathname: string): RouteSeo => {
  pathname = normalizeSeoPath(pathname);
  const publicDescription = PUBLIC_DESCRIPTIONS[pathname];
  if (publicDescription) {
    const titles: Record<string, string> = {
      "/": "AI 创业点子验证",
      "/validate": "验证我的创业想法",
      "/discover": "热点雷达 - 发现商业机会",
      "/pricing": "定价方案",
      "/faq": "常见问题",
      "/privacy": "隐私政策",
      "/terms": "服务条款",
    };
    return { title: titles[pathname], description: publicDescription, robots: "index, follow" };
  }

  if (pathname.startsWith("/p/")) {
    return {
      title: "MVP 落地页",
      description: "了解这个产品想法并加入早期用户等待名单。",
      robots: "index, follow",
    };
  }

  if (pathname.startsWith("/admin/")) {
    return { title: "管理后台", description: "IdeaScan 管理后台，仅供授权管理员使用。", robots: "noindex, nofollow" };
  }

  if (pathname.startsWith("/report/") || pathname.startsWith("/share/")) {
    return { title: "需求验证报告", description: "查看 IdeaScan 需求验证报告及市场分析。", robots: "noindex, nofollow" };
  }

  if (pathname === "/auth" || pathname.startsWith("/auth/")) {
    return { title: "登录或注册", description: "登录或注册 IdeaScan，管理你的创业想法和验证报告。", robots: "noindex, nofollow" };
  }

  const toolTitles: Record<string, string> = {
    "/history": "历史记录", "/compare": "对比分析", "/openclaw": "OpenClaw AI 助手",
    "/content-studio": "内容工作室", "/gallery": "报告精选",
  };
  return {
    title: pathname.startsWith("/mvp/") ? "MVP 生成器" : toolTitles[pathname] ?? "页面未找到",
    description: "IdeaScan 创业想法验证与市场洞察工具。",
    robots: "noindex, nofollow",
  };
};

export function normalizeSeoPath(path: string): string {
  return new URL(path, SITE_ORIGIN).pathname.replace(/\/+$/, "") || "/";
}

export interface SeoOptions {
  deps?: unknown[];
  description?: string;
  canonical?: string;
  robots?: RouteSeo["robots"];
  ogImage?: string;
}

export interface PageSeo {
  title: string;
  description: string;
  canonical: string;
  robots: RouteSeo["robots"];
  image: string;
  path: string;
}

export function resolvePageSeo(pathname: string, title?: string, options: SeoOptions = {}): PageSeo {
  const path = normalizeSeoPath(pathname);
  const defaults = getRouteSeo(path);
  const pageTitle = title || defaults.title;
  return {
    title: /IdeaScan/i.test(pageTitle) ? pageTitle : `${pageTitle} | ${SITE_NAME}`,
    description: options.description || defaults.description || "IdeaScan 创业想法验证与市场洞察工具。",
    canonical: options.canonical || `${SITE_ORIGIN}${path}`,
    robots: options.robots ?? defaults.robots,
    image: options.ogImage || `${SITE_ORIGIN}/og-image.png`,
    path,
  };
}
