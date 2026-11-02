import { afterEach, describe, expect, it, vi } from "vitest";
import { TikHubClient, TikHubError } from "../../supabase/functions/_shared/tikhub-client.ts";

const json = (data: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("TikHub current API contract", () => {
  it("uses XHS App V2 fields and preserves the search session on pagination", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ code: 200, data: { data: {
      items: [{ note: { id: "n1", title: "猫咪" } }, { note: { id: "n1" } }, { type: "ad" }],
      search_id: "s1", search_session_id: "session1", has_more: 1,
    } } })).mockResolvedValueOnce(json({ code: 200, data: { items: [] } }));
    vi.stubGlobal("fetch", fetcher);
    const client = new TikHubClient("test-token");
    const first = await client.searchXhs("猫咪");
    await client.searchXhs("猫咪", { page: 2, searchId: first.searchId, searchSessionId: first.searchSessionId });
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/v1/xiaohongshu/app_v2/search_notes");
    expect(url.searchParams.get("sort_type")).toBe("general");
    expect(url.searchParams.get("note_type")).toBe("不限");
    expect(url.searchParams.has("sort")).toBe(false);
    expect(first.notes.map(n => n.id)).toEqual(["n1"]);
    const next = new URL(fetcher.mock.calls[1][0]);
    expect(next.searchParams.get("search_id")).toBe("s1");
    expect(next.searchParams.get("search_session_id")).toBe("session1");
  });

  it("uses POST Douyin V5 with the full continuation state", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ code: 200, data: {
      items: [{ aweme_id: "v1", statistics: { digg_count: 10 } }],
      pagination: { offset: 10, next_page: 2, search_id: "s", backtrace: "b", has_more: 1 },
    } })).mockResolvedValueOnce(json({ code: 200, data: { items: [], pagination: { has_more: 0 } } }));
    vi.stubGlobal("fetch", fetcher);
    const client = new TikHubClient("test-token");
    const first = await client.searchDouyin("猫咪");
    await client.searchDouyin("猫咪", first.pagination);
    expect(new URL(fetcher.mock.calls[0][0]).pathname).toBe("/api/v1/douyin/search/fetch_video_search_v5");
    expect(fetcher.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ keyword: "猫咪", offset: 10, page: 2, search_id: "s", backtrace: "b" });
    expect(first.videos[0].aweme_id).toBe("v1");
  });

  it("accepts known Douyin comment-list wrappers without treating malformed data as empty", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ code: 200, data: { comment_list: [{ cid: "c1", text: "reply" }] } }));
    vi.stubGlobal("fetch", fetcher);
    await expect(new TikHubClient("token").getDouyinComments("v1", 1)).resolves.toEqual([{ cid: "c1", text: "reply" }]);
  });

  it("paginates XHS comments with cursor, index and pageArea, deduplicating results", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ code: 200, data: { data: {
      comments: [{ id: "c1", content: "a" }], cursor: "next", index: 1, pageArea: "FOLDED", has_more: 1,
    } } })).mockResolvedValueOnce(json({ code: 200, data: { data: {
      comments: [{ id: "c1", content: "a" }, { id: "c2", content: "b" }], cursor: "end", index: 2, has_more: 0,
    } } }));
    vi.stubGlobal("fetch", fetcher);
    const comments = await new TikHubClient("token").getXhsComments("n1", 3);
    const next = new URL(fetcher.mock.calls[1][0]);
    expect(Object.fromEntries(next.searchParams)).toMatchObject({ cursor: "next", index: "1", pageArea: "FOLDED", sort_strategy: "latest_v2" });
    expect(comments.map(c => c.id)).toEqual(["c1", "c2"]);
  });

  it("does not loop when the comment continuation state does not advance", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(json({ code: 200, data: { data: {
      comments: [{ id: "c1" }], cursor: "same", index: 1, has_more: 1,
    } } })));
    vi.stubGlobal("fetch", fetcher);
    expect(await new TikHubClient("token").getXhsComments("n1", 100)).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects HTTP-200 upstream failures instead of treating them as empty success", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ code: 200, data: { success: false, code: -1, msg: "服务异常" } }));
    vi.stubGlobal("fetch", fetcher);
    const client = new TikHubClient("token");
    await expect(client.searchXhs("猫咪")).rejects.toBeInstanceOf(TikHubError);
    expect(client.stats).toMatchObject({ apiCalls: 1, failedCalls: 1, retries: 0 });
  });

  it.each([401, 402, 403, 422])("never retries HTTP %i", async (status) => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(json({}, status)));
    vi.stubGlobal("fetch", fetcher);
    await expect(new TikHubClient("token").searchXhs("猫咪")).rejects.toMatchObject({ status, retryable: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("honors Retry-After and counts physical attempts including failures", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(json({}, 429, { "Retry-After": "2" }))
      .mockResolvedValueOnce(json({ code: 200, data: { items: [] } }));
    vi.stubGlobal("fetch", fetcher);
    const client = new TikHubClient("token");
    const result = client.searchXhs("猫咪");
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(client.stats).toEqual({ apiCalls: 2, failedCalls: 1, retries: 1, rateLimited: true });
  });

  it("times out the response body too, even when timeoutMs is zero", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    }));
    vi.stubGlobal("fetch", fetcher);
    const client = new TikHubClient("token", { timeoutMs: 0, maxRetries: 0 });
    const result = expect(client.searchXhs("猫咪")).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(45000);
    await result;
    expect(client.stats.apiCalls).toBe(1);
  });

  it("keeps the deadline active after headers while reading a stalled body", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, init) => Promise.resolve({
      ok: true, status: 200, headers: new Headers(),
      text: () => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      }),
    })));
    const result = expect(new TikHubClient("token", { maxRetries: 0 }).searchXhs("猫咪")).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(45000);
    await result;
  });

  it("does not mistake unexpected JSON shapes for valid empty results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ code: 200, data: { unexpected: true } })));
    await expect(new TikHubClient("token").searchXhs("猫咪")).rejects.toBeInstanceOf(TikHubError);
  });

  it("never retries before a long Retry-After and records zero performed retries", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({}, 429, { "Retry-After": "90" }));
    vi.stubGlobal("fetch", fetcher);
    const client = new TikHubClient("token");
    await expect(client.searchDouyin("cat")).rejects.toMatchObject({ status: 429 });
    expect(client.stats).toEqual({ apiCalls: 1, failedCalls: 1, retries: 0, rateLimited: true });
  });

  it("rejects non-JSON success responses and does not leak the token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>failure</html>")));
    await expect(new TikHubClient("secret-token").searchXhs("猫咪")).rejects.toMatchObject({ retryable: false });
  });

  it("skips blank IDs and zero comment limits without billed requests", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const client = new TikHubClient("token");
    expect(await client.getXhsComments("", 10)).toEqual([]);
    expect(await client.getDouyinComments("v1", 0)).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
