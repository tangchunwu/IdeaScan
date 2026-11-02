import { afterEach, describe, expect, it, vi } from 'vitest';
import { TikHubClient } from '../../supabase/functions/_shared/tikhub-client.ts';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('TikHub real response and diagnostic boundaries', () => {
  it('prefers the explicit TikTok search-item result and forwards its cursor without inventing offsets', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ code: 200, data: { aweme_list: [], search_item_list: [
      { aweme_info: { aweme_id: 'video-1', desc: 'synthetic' } }, { aweme_info: { aweme_id: 'video-1' } }, { type: 'ad' },
    ], cursor: 7, has_more: 1 } }));
    vi.stubGlobal('fetch', fetcher);
    const page = await new TikHubClient('offline-placeholder').searchTikTok('software');
    expect(page.items.map(x => x.aweme_id)).toEqual(['video-1']);
    expect(page.offset).toBe(7);
    expect(page.hasMore).toBe(true);
  });
  it('preserves explicit empty TikTok search results instead of falling back to unrelated arrays', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ code: 200, data: { search_item_list: [], aweme_list: [{ aweme_id: 'unrelated' }], cursor: 0, has_more: 0 } })));
    expect((await new TikHubClient('offline-placeholder').searchTikTok('software')).items).toEqual([]);
  });
  it('keeps HTTP status separate from the business failure code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ code: 400, message: 'Invalid argument', request_id: 'offline-request-123' })));
    await expect(new TikHubClient('offline-placeholder').searchInstagram('software')).rejects.toMatchObject({ httpStatus: 200, businessCode: 400, kind: 'business', requestId: 'offline-request-123', retryable: false });
  });
  it('redacts exact credentials, bearer values, URLs and long secret-like strings from diagnostics', async () => {
    const secret = 'offline-secret+with/slashes==';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ code: 400, message: `Invalid argument ${secret}; Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789; https://example.org/?token=private`, request_id: secret }, 400)));
    const error = await new TikHubClient(secret).searchInstagram('software').catch(e => e);
    const rendered = `${error.message} ${JSON.stringify(error)}`;
    expect(rendered).not.toContain(secret);
    expect(rendered).not.toContain('abcdefghijklmnopqrstuvwxyz0123456789');
    expect(rendered).not.toContain('token=private');
    expect(error).toMatchObject({ httpStatus: 400, businessCode: 400, kind: 'http' });
  });
  it('classifies network failure without pretending an HTTP response was received', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed with private contents')));
    await expect(new TikHubClient('offline-placeholder', { maxRetries: 0 }).searchXhs('offline')).rejects.toMatchObject({ status: 0, httpStatus: null, kind: 'network' });
  });
  it('honors a short deadline and distinguishes a real client timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))));
    const promise = expect(new TikHubClient('offline-placeholder', { timeoutMs: 50, maxRetries: 0 }).searchXhs('offline')).rejects.toMatchObject({ kind: 'timeout', httpStatus: null });
    await vi.advanceTimersByTimeAsync(50);
    await promise;
  });
  it('does not bypass the physical request budget, even when another method is called', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(json({ code: 200, data: { items: [] } })));
    vi.stubGlobal('fetch', fetcher);
    const client = new TikHubClient('offline-placeholder', { maxRequests: 1, maxRetries: 0 });
    await client.searchXhs('offline');
    await expect(client.searchXhs('offline')).rejects.toMatchObject({ kind: 'budget', httpStatus: null });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(client.stats.apiCalls).toBe(1);
  });
  it('uses a single authenticated user-info request and stops before fetching when cancelled', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ code: 200, data: { id: 'synthetic' } }));
    vi.stubGlobal('fetch', fetcher);
    await new TikHubClient('offline-placeholder').getUserInfo();
    expect(new URL(fetcher.mock.calls[0][0]).pathname).toBe('/api/v1/tikhub/user/get_user_info');
    const controller = new AbortController(); controller.abort();
    await expect(new TikHubClient('offline-placeholder', { signal: controller.signal }).searchXhs('offline')).rejects.toMatchObject({ kind: 'budget' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('probes XHS comments once even when the page advertises more results', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ code: 200, data: { comments: [], has_more: 1, cursor: 'next', index: 1 } }));
    vi.stubGlobal('fetch', fetcher);
    expect(await new TikHubClient('offline-placeholder').getXhsCommentsFirstPage('note', 1)).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
