import { describe, expect, it } from "vitest";
import { buildOverseasSocialData, overseasToSocialData } from "../../supabase/functions/_shared/overseas-social.ts";

describe("overseas social report payload", () => {
  it("builds an independent aggregate without changing scoring fields", () => {
    const result = buildOverseasSocialData(["tiktok", "reddit"], {
      success: true,
      results: [
        { channel: "tiktok", success: true, posts: [{ post_id: "t1" }], comments: [{ comment_id: "c1" }], stats: { total_engagement: 12 } },
        { channel: "reddit", success: false, error: "rate limited", posts: [], comments: [], stats: { total_engagement: 0 } },
      ],
    } as any);

    expect(result.schemaVersion).toBe(1);
    expect(result.requestedPlatforms).toEqual(["tiktok", "reddit"]);
    expect(result.aggregate).toEqual({ totalPosts: 1, totalComments: 1, totalEngagement: 12 });
    expect(result.platforms.reddit).toMatchObject({ status: "error", error: "rate limited" });
  });

  it("deduplicates requested platform names", () => {
    const result = buildOverseasSocialData(["tiktok", "tiktok"], { success: true, results: [], combined_stats: {} } as any);
    expect(result.requestedPlatforms).toEqual(["tiktok"]);
    expect(result.aggregate).toEqual({ totalPosts: 0, totalComments: 0, totalEngagement: 0 });
  });

  it("converts overseas samples into the shared scoring input", () => {
    const social = overseasToSocialData({ platforms: { tiktok: { status: "success", posts: [{ post_id: "t1", title: "T", content: "C", platform: "tiktok", metrics: { likes: 10, comments: 2, shares: 1, collects: 0 }, author: "a" }], comments: [{ comment_id: "c1", post_id: "t1", content: "need", author: "b", metrics: { likes: 3 } }] } } });
    expect(social.totalNotes).toBe(1);
    expect(social.sampleNotes[0]._platform).toBe("tiktok");
    expect(social.sampleComments[0].post_id).toBe("t1");
  });
});
