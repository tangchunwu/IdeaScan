import { act, cleanup, render } from "@testing-library/react";
import { BrowserRouter, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { resolvePageSeo } from "@/lib/seo";

afterEach(() => {
  cleanup();
  document.head.innerHTML = "";
  window.history.replaceState({}, "", "/");
});

describe("route SEO", () => {
  it("removes query strings, fragments and trailing slashes from canonical URLs", () => {
    const seo = resolvePageSeo("/validate/?idea=private&code=secret#form");
    expect(seo.canonical).toBe("https://ideascan.me/validate");
    expect(seo.robots).toBe("index, follow");
  });

  it.each(["/auth", "/auth/callback/linuxdo", "/admin/models", "/history", "/report/123", "/share/abc", "/unknown"])(
    "keeps %s out of search results", (path) => {
      expect(resolvePageSeo(path).robots).toBe("noindex, nofollow");
    },
  );

  it("creates missing metadata and updates URLs even when two routes share a title", () => {
    window.history.replaceState({}, "", "/faq");
    let navigate: ReturnType<typeof useNavigate>;
    function Page() {
      navigate = useNavigate();
      useDocumentTitle("帮助");
      return null;
    }
    render(<BrowserRouter><Page /></BrowserRouter>);
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute("href", "https://ideascan.me/faq");
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute("content", resolvePageSeo("/faq").description);
    act(() => navigate("/pricing?utm_source=test"));
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute("href", "https://ideascan.me/pricing");
    expect(document.querySelector('meta[property="og:url"]')).toHaveAttribute("content", "https://ideascan.me/pricing");
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute("content", resolvePageSeo("/pricing").description);
    act(() => navigate("/auth/callback/linuxdo?code=secret"));
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.innerHTML).not.toContain("secret");
  });
});
