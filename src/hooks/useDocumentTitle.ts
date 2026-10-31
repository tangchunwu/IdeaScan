import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import { normalizeSeoPath, resolvePageSeo, type SeoOptions } from "@/lib/seo";

const setMetaContent = (selector: string, content: string) => {
  let meta = document.querySelector<HTMLMetaElement>(selector);
  if (!meta) {
    const attribute = selector.match(/\[(name|property)="([^"]+)"\]/);
    if (!attribute) return;
    meta = document.createElement("meta");
    meta.setAttribute(attribute[1], attribute[2]);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
};

/**
 * 页面标题和路由元数据一起更新，避免页面切换后残留旧 canonical。
 */
export function useDocumentTitle(
  title: string,
  options?: unknown[] | SeoOptions
) {
  const { pathname } = useLocation();
  const deps = Array.isArray(options) ? options : options?.deps ?? [];
  const seoOptions = Array.isArray(options) ? undefined : options;
  const description = seoOptions?.description;
  const canonical = seoOptions?.canonical;
  const robots = seoOptions?.robots;
  const ogImage = seoOptions?.ogImage;

  useLayoutEffect(() => {
    const path = normalizeSeoPath(pathname);
    // 退出动画中的旧页面不能覆盖当前路由的元数据。
    if (path !== normalizeSeoPath(window.location.pathname)) return;
    const pageSeo = resolvePageSeo(path, title, {
      description,
      canonical,
      robots,
      ogImage,
    });
    let canonicalLink = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement("link");
      canonicalLink.rel = "canonical";
      document.head.appendChild(canonicalLink);
    }

    document.title = pageSeo.title;

    canonicalLink.setAttribute("href", pageSeo.canonical);
    if (pageSeo.description) {
      setMetaContent('meta[name="description"]', pageSeo.description);
      setMetaContent('meta[property="og:description"]', pageSeo.description);
      setMetaContent('meta[name="twitter:description"]', pageSeo.description);
    }
    setMetaContent('meta[name="robots"]', pageSeo.robots);
    setMetaContent('meta[property="og:url"]', pageSeo.canonical);
    setMetaContent('meta[property="og:title"]', document.title);
    setMetaContent('meta[property="og:image"]', pageSeo.image);
    setMetaContent('meta[name="twitter:url"]', pageSeo.canonical);
    setMetaContent('meta[name="twitter:title"]', document.title);
    setMetaContent('meta[name="twitter:image"]', pageSeo.image);

    // 页面级 SEO 允许复用调用方传入的动态依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, title, description, canonical, robots, ogImage, ...deps]);
}
