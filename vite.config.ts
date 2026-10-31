import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { STATIC_SEO_PATHS, resolvePageSeo } from "./src/lib/seo";

const seoStaticPages = (): Plugin => ({
  name: "ideascan-static-seo-pages",
  enforce: "post",
  generateBundle(_options, bundle) {
    const indexAsset = bundle["index.html"];
    if (!indexAsset || indexAsset.type !== "asset") {
      this.error("SEO build: index.html was not emitted before the SEO plugin.");
    }

    const indexHtml = indexAsset.source.toString();
    for (const path of STATIC_SEO_PATHS) {
      const page = resolvePageSeo(path);
      const html = indexHtml
        .replace(/<title>[^<]*<\/title>/, `<title>${page.title}</title>`)
        .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${page.description}" />`)
        .replace(/<meta name="robots" content="[^"]*" \/>/, `<meta name="robots" content="${page.robots}" />`)
        .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${page.canonical}" />`)
        .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${page.canonical}" />`)
        .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${page.title}" />`)
        .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${page.description}" />`)
        .replace(/<meta name="twitter:url" content="[^"]*" \/>/, `<meta name="twitter:url" content="${page.canonical}" />`)
        .replace(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${page.title}" />`)
        .replace(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${page.description}" />`);
      if (path === "/") {
        indexAsset.source = html;
        continue;
      }
      this.emitFile({
        type: "asset",
        fileName: `${path.replace(/^\//, "")}/index.html`,
        // 首页 WebApplication 结构化数据不能原样复制到登录或其他内页。
        source: html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ""),
      });
    }
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const supabaseUrl =
    env.VITE_SUPABASE_URL ||
    env.SUPABASE_URL ||
    "https://tayhqwtvsuurtwtpscai.supabase.co";

  const supabasePublishableKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY ||
    env.SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRheWhxd3R2c3V1cnR3dHBzY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNjQzNjksImV4cCI6MjA4NTY0MDM2OX0.750sYYNHGZaXDgb5nHCpAmpWDDLk16u77DFuPHprxDk";

  const supabaseProjectId =
    env.VITE_SUPABASE_PROJECT_ID ||
    env.SUPABASE_PROJECT_ID ||
    "tayhqwtvsuurtwtpscai";

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react(), seoStaticPages(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabasePublishableKey),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(supabaseProjectId),
    },
  };
});

