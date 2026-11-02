import { afterEach, describe, expect, it, vi } from "vitest";
import { TikHubClient, TikHubError } from "../../supabase/functions/_shared/tikhub-client.ts";

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TikHub overseas API contracts", () => {
  it("uses TikTok official search/comment paths and forwards upstream pagination", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ code: 200, data: { items: [{ aweme_id: "v1" }], has_more: 1, next_offset: 20 } }))
      .mockResolvedValueOnce(json({ code: 200, data: { items: [{ aweme_id: "v2" }], has_more: 0 } }))
      .mockResolvedValueOnce(json({ code: 200, data: { comments: [{ cid: "c1" }], has_more: 1, next_cursor: 7 } }));
    vi.stubGlobal("fetch", fetcher);
    const client = new TikHubClient("token");

    const page = await client.searchTikTok("猫咪", { count: 20, region: "GB" });
    await client.searchTikTok("猫咪", { offset: page.offset, count: 20, region: "GB" });
    const commentsPage = await client.getTikTokComments("v1", { cursor: 6, count: 10 });

    const searchUrl = new URL(fetcher.mock.calls[0][0]);
    expect(searchUrl.pathname).toBe("/api/v1/tiktok/app/v3/fetch_video_search_result");
    expect(Object.fromEntries(searchUrl.searchParams)).toMatchObject({
      keyword: "猫咪",
      offset: "0",
      count: "20",
      sort_type: "0",
      publish_time: "0",
      region: "GB",
    });
    const nextUrl = new URL(fetcher.mock.calls[1][0]);
    expect(nextUrl.searchParams.get("offset")).toBe("20");
    const commentsUrl = new URL(fetcher.mock.calls[2][0]);
    expect(commentsUrl.pathname).toBe("/api/v1/tiktok/app/v3/fetch_video_comments");
    expect(Object.fromEntries(commentsUrl.searchParams)).toMatchObject({ aweme_id: "v1", cursor: "6", count: "10" });
    expect(page.offset).toBe(20);
    expect(commentsPage.continuationToken).toBe("7");
    expect(client.stats.apiCalls).toBe(3);
  });

  it("uses both Instagram search paths and forwards pagination_token", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ code: 200, data: { items: [{ code: "p1" }], pagination_token: "ig-next" } }))
      .mockResolvedValueOnce(json({ code: 200, data: { reels: [{ code: "r1" }] } }))
      .mockResolvedValueOnce(json({ code: 200, data: { comments: [{ id: "c1" }] } }));
    vi.stubGlobal("fetch", fetcher);
    const client = new TikHubClient("token");

    const page = await client.searchInstagram("猫咪");
    await client.searchInstagram("猫咪", { paginationToken: page.continuationToken, mode: "reels" });
    const commentsPage = await client.getInstagramComments("C1", { sortBy: "recent", paginationToken: "comment-next" });

    expect(new URL(fetcher.mock.calls[0][0]).pathname).toBe("/api/v1/instagram/v2/general_search");
    expect(new URL(fetcher.mock.calls[1][0]).pathname).toBe("/api/v1/instagram/v2/search_reels");
    expect(new URL(fetcher.mock.calls[1][0]).searchParams.get("pagination_token")).toBe("ig-next");
    const commentsUrl = new URL(fetcher.mock.calls[2][0]);
    expect(commentsUrl.pathname).toBe("/api/v1/instagram/v2/fetch_post_comments");
    expect(Object.fromEntries(commentsUrl.searchParams)).toMatchObject({ code_or_url: "C1", sort_by: "recent", pagination_token: "comment-next" });
    expect(commentsPage.comments).toHaveLength(1);
  });

  it("uses YouTube official filters and continuation_token without inventing need_format", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ code: 200, data: { items: [{ videoId: "y1" }], continuation_token: "yt-next" } }))
      .mockResolvedValueOnce(json({ code: 200, data: { comments: [{ id: "c1" }] } }));
    vi.stubGlobal("fetch", fetcher);
    const client = new TikHubClient("token");

    const page = await client.searchYouTube("猫咪", { type: "video", sortBy: "view_count" });
    await client.getYouTubeComments("y1", {
      languageCode: "en",
      countryCode: "US",
      sortBy: "top",
      continuationToken: page.continuationToken,
      needFormat: true,
    });

    const searchUrl = new URL(fetcher.mock.calls[0][0]);
    expect(searchUrl.pathname).toBe("/api/v1/youtube/web_v2/get_general_search_v2");
    expect(Object.fromEntries(searchUrl.searchParams)).toMatchObject({ keyword: "猫咪", type: "video", sort_by: "view_count" });
    expect(searchUrl.searchParams.has("need_format")).toBe(false);
    const commentsUrl = new URL(fetcher.mock.calls[1][0]);
    expect(commentsUrl.pathname).toBe("/api/v1/youtube/web_v2/get_video_comments");
    expect(Object.fromEntries(commentsUrl.searchParams)).toMatchObject({
      video_id: "y1",
      language_code: "en",
      country_code: "US",
      sort_by: "top",
      continuation_token: "yt-next",
      need_format: "true",
    });
  });

  it("uses Reddit formatted search/comments and forwards after", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ code: 200, data: { children: [{ data: { id: "p1" } }], pageInfo: { endCursor: "reddit-next" } } }))
      .mockResolvedValueOnce(json({ code: 200, data: { children: [{ data: { id: "c1" } }] } }));
    vi.stubGlobal("fetch", fetcher);
    const client = new TikHubClient("token");

    const page = await client.searchReddit("猫咪", { language: "en-US", sort: "HOT" });
    await client.getRedditComments("t3_p1", { language: "en-US", sortType: "TOP", after: page.after });

    const searchUrl = new URL(fetcher.mock.calls[0][0]);
    expect(searchUrl.pathname).toBe("/api/v1/reddit/app/fetch_dynamic_search");
    expect(Object.fromEntries(searchUrl.searchParams)).toMatchObject({
      query: "猫咪",
      language: "en-US",
      search_type: "post",
      sort: "HOT",
      safe_search: "unset",
      allow_nsfw: "0",
      need_format: "true",
    });
    const commentsUrl = new URL(fetcher.mock.calls[1][0]);
    expect(commentsUrl.pathname).toBe("/api/v1/reddit/app/fetch_post_comments");
    expect(Object.fromEntries(commentsUrl.searchParams)).toMatchObject({ post_id: "t3_p1", language: "en-US", sort_type: "TOP", after: "reddit-next", need_format: "true" });
  });

  it("maps Reddit commentForest trees and preserves pageInfo endCursor", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ code: 200, data: {
      postInfoById: { commentForest: { trees: [{ node: { id: "t1_c1", content: { markdown: "Reply" } } }], pageInfo: { endCursor: "reddit-next", hasNextPage: true } } },
    } }));
    vi.stubGlobal("fetch", fetcher);
    const page = await new TikHubClient("token").getRedditComments("t3_p1", { after: "" });
    expect(page.comments).toEqual([{ id: "t1_c1", content: { markdown: "Reply" } }]);
    expect(page.after).toBe("reddit-next");
    expect(page.hasMore).toBe(true);
  });

  it.each([401, 402, 403, 422])("does not retry overseas calls on HTTP %i", async (status) => {
    const fetcher = vi.fn().mockResolvedValue(json({}, status));
    vi.stubGlobal("fetch", fetcher);
    const client = new TikHubClient("token");

    await expect(client.searchReddit("cats")).rejects.toMatchObject({ status, retryable: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(client.stats).toMatchObject({ apiCalls: 1, failedCalls: 1, retries: 0, rateLimited: false });
  });

  it("stops on a long 429 Retry-After without spending a retry", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({}, 429, { "Retry-After": "90" }));
    vi.stubGlobal("fetch", fetcher);
    const client = new TikHubClient("token");

    await expect(client.searchTikTok("cats")).rejects.toMatchObject({ status: 429 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(client.stats).toEqual({ apiCalls: 1, failedCalls: 1, retries: 0, rateLimited: true });
  });

  it("rejects a successful envelope without the expected array and counts it once", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ code: 200, data: { pageInfo: { endCursor: "x" } } })));
    const client = new TikHubClient("token");

    await expect(client.searchYouTube("cats")).rejects.toBeInstanceOf(TikHubError);
    expect(client.stats).toMatchObject({ apiCalls: 1, failedCalls: 1, retries: 0 });
  });
});
