import { useEffect } from "react";

const SITE_NAME = "IdeaScan - 创意验证器";

/**
 * Sets document title dynamically for SEO.
 * @param title - Page-specific title (will be appended with site name)
 * @param deps - Optional dependencies to trigger re-render
 */
export function useDocumentTitle(title: string, deps: any[] = []) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
    return () => {
      document.title = prev;
    };
  }, [title, ...deps]);
}
