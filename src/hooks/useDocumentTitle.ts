import { useEffect } from "react";

const SITE_NAME = "IdeaScan - 创意验证器";

/**
 * Sets document title and optionally meta description for SEO.
 * @param title - Page-specific title (will be appended with site name)
 * @param options - Optional: deps array or config object with description
 */
export function useDocumentTitle(
  title: string,
  options?: any[] | { deps?: any[]; description?: string }
) {
  const deps = Array.isArray(options) ? options : options?.deps ?? [];
  const description = Array.isArray(options) ? undefined : options?.description;

  useEffect(() => {
    const prevTitle = document.title;
    document.title = title ? `${title} | ${SITE_NAME}` : SITE_NAME;

    let prevDescription: string | null = null;
    if (description) {
      const meta = document.querySelector('meta[name="description"]');
      if (meta) {
        prevDescription = meta.getAttribute("content");
        meta.setAttribute("content", description);
      }
    }

    return () => {
      document.title = prevTitle;
      if (description && prevDescription !== null) {
        const meta = document.querySelector('meta[name="description"]');
        if (meta) meta.setAttribute("content", prevDescription);
      }
    };
  }, [title, description, ...deps]);
}
