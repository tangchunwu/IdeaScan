import { describe, expect, it } from "vitest";
import {
  createValidateAuthRedirect,
  getValidateRouteIntent,
  getDiscoverValidationUrl,
  getOpportunityValidationUrl,
} from "@/lib/validateRoute";
import { getRouteSeo, resolvePageSeo, STATIC_SEO_PATHS } from "@/lib/seo";

describe("validate route helpers", () => {
  it("uses URLSearchParams output as-is without decoding it twice", () => {
    const params = new URLSearchParams("idea=%E7%8C%AB%E5%92%96%E5%95%A1%E5%BA%97&auto=true");

    expect(getValidateRouteIntent(params)).toEqual({
      idea: "猫咖啡店",
      auto: true,
      resumeValidationId: "",
      country: "",
      industry: "",
      platforms: [],
      tags: [],
      source: "",
    });
  });

  it("keeps the full validation query when redirecting to login", () => {
    const params = new URLSearchParams(
      "idea=%E7%8C%AB%E5%92%96%E5%95%A1%E5%BA%97&auto=true&resumeValidationId=v-123",
    );

    const redirect = new URLSearchParams(createValidateAuthRedirect(params).split("?")[1]).get("redirect");
    expect(redirect).toBe("/validate?idea=%E7%8C%AB%E5%92%96%E5%95%A1%E5%BA%97&auto=true&resumeValidationId=v-123");
  });

  it("uses the same idea parameter for Discover bubble navigation", () => {
    expect(getDiscoverValidationUrl("猫咪下午茶 & 咖啡")).toBe(
      "/validate?idea=%E7%8C%AB%E5%92%AA%E4%B8%8B%E5%8D%88%E8%8C%B6%20%26%20%E5%92%96%E5%95%A1",
    );
  });

  it("preserves opportunity context without automatic validation or double decoding", () => {
    const input = {
      title: "排班 & 100% + AI",
      problem: "跨时区沟通\n成本高",
      targetUsers: "小型诊所",
      country: "美国 & 加拿大",
      industry: "医疗服务",
      platforms: ["reddit", "youtube"],
    };
    const url = getOpportunityValidationUrl(input);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(url.startsWith("/validate?")).toBe(true);
    expect(params.get("country")).toBe(input.country);
    expect(params.get("industry")).toBe(input.industry);
    expect(params.get("platforms")).toBe("reddit,youtube");
    expect(params.get("tags")).toBe(input.industry);
    expect(params.get("source")).toBe("opportunity-radar");
    expect(params.has("auto")).toBe(false);
    const intent = getValidateRouteIntent(params);
    expect(intent).toMatchObject({
      country: input.country, industry: input.industry,
      platforms: input.platforms, tags: [input.industry],
      source: "opportunity-radar", auto: false,
    });
    for (const value of [input.title, input.problem, input.targetUsers, input.country, input.industry]) {
      expect(intent.idea).toContain(value);
    }
    const redirect = new URLSearchParams(createValidateAuthRedirect(params).split("?")[1]).get("redirect");
    expect(redirect).toBe(url);
  });

  it("normalizes route selections and respects the five-tag limit", () => {
    const intent = getValidateRouteIntent(new URLSearchParams({
      topic: "旧版热点", platforms: " reddit,unknown,reddit,douyin,,youtube, twitter, threads ",
      tags: " 医疗,医疗,,排班,诊所,效率,工具,第六个 ",
    }));
    expect(intent.idea).toBe("旧版热点");
    expect(intent.platforms).toEqual(["reddit", "douyin", "youtube", "twitter", "threads"]);
    expect(intent.tags).toEqual(["医疗", "排班", "诊所", "效率", "工具"]);
  });
  it("bounds a radar candidate to the existing 500-character idea form", () => {
    const url = getOpportunityValidationUrl({ title: 'x'.repeat(160), problem: 'p'.repeat(1200), targetUsers: 'u'.repeat(300), country: 'US', industry: 'Accounting', platforms: ['reddit'] });
    const idea = new URLSearchParams(url.split('?')[1]).get('idea')!;
    expect(idea.length).toBeLessThanOrEqual(500);
    expect(idea).toContain('目标国家：US');
    expect(idea).toContain('目标行业：Accounting');
  });

  it("defines opportunity radar metadata without indexing private queries", () => {
    expect(STATIC_SEO_PATHS).toContain("/opportunity-radar");
    expect(getRouteSeo("/opportunity-radar")).toMatchObject({
      title: "商机雷达", robots: "noindex, nofollow",
    });
    expect(resolvePageSeo("/opportunity-radar/?country=private#form")).toMatchObject({
      canonical: "https://ideascan.me/opportunity-radar", robots: "noindex, nofollow",
    });
  });
});
