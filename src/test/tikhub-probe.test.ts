import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diagnosticFailure, runTikHubDiagnostics } from '../../supabase/functions/_shared/tikhub-probe.ts';
import { TikHubError } from '../../supabase/functions/_shared/tikhub-client.ts';

const mock = vi.hoisted(() => ({ client: null as any, options: null as any }));
vi.mock('../../supabase/functions/_shared/tikhub-client.ts', async importOriginal => ({ ...(await importOriginal<any>()), TikHubClient: class {
  constructor(_token: string, options: unknown) { mock.options = options; return mock.client; }
} }));
beforeEach(() => {
  mock.client = { stats: { apiCalls: 0 }, getUserInfo: vi.fn(async () => { mock.client.stats.apiCalls++; return {}; }) };
  for (const method of ['searchXhs', 'searchDouyin', 'searchTikTok', 'searchInstagram', 'searchYouTube', 'searchReddit', 'searchTwitter', 'searchThreads']) {
    mock.client[method] = vi.fn(async () => { mock.client.stats.apiCalls++; return { notes: [], videos: [], items: [] }; });
  }
  for (const method of ['getXhsCommentsFirstPage', 'getDouyinComments', 'getTikTokComments', 'getInstagramComments', 'getYouTubeComments', 'getRedditComments', 'getTwitterComments', 'getThreadsComments', 'request']) {
    mock.client[method] = vi.fn(async () => { mock.client.stats.apiCalls++; return method === 'request' ? { data: { comments: [] } } : []; });
  }
});
afterEach(() => vi.useRealTimers());
describe('bounded TikHub diagnostics', () => {
  it('does not present a synthesized timeout status as a real HTTP response', () => {
    const error = new TikHubError('TikHub request timed out', { status: 408, httpStatus: null, kind: 'timeout' });
    expect(diagnosticFailure(error)).toMatchObject({ httpStatus: null, kind: 'timeout' });
  });
  it('stops further requests on a business-level quota failure without a numeric code', async () => {
    mock.client.searchTikTok.mockRejectedValue(new TikHubError('Quota exhausted', { kind: 'business', httpStatus: 200, upstreamMessage: '余额不足' }));
    const result = await runTikHubDiagnostics('offline', ['tiktok', 'youtube']);
    expect(result.platforms[1].search.status).toBe('skipped');
    expect(mock.client.searchYouTube).not.toHaveBeenCalled();
  });
  it('uses at most seventeen actual calls for eight platforms and discards auth contents', async () => {
    mock.client.getUserInfo.mockImplementation(async () => { mock.client.stats.apiCalls++; return { user_balance: 'private-balance', access_token: 'private-auth' }; });
    const pages = { searchXhs: { notes: [{ id: 'n1' }] }, searchDouyin: { videos: [{ aweme_id: 'dy1' }] }, searchTikTok: { items: [{ aweme_id: 'tt1' }] }, searchInstagram: { items: [{ code: 'ig1' }] }, searchYouTube: { items: [{ video_id: 'yt1' }] }, searchReddit: { items: [{ post: { id: 'rd1' } }] }, searchTwitter: { items: [{ tweet_id: 'tw1' }] }, searchThreads: { items: [{ pk: 'th1' }] } };
    for (const [method, page] of Object.entries(pages)) mock.client[method].mockImplementation(async () => { mock.client.stats.apiCalls++; return page; });
    const result = await runTikHubDiagnostics('offline', ['xiaohongshu', 'douyin', 'tiktok', 'instagram', 'youtube', 'reddit', 'twitter', 'threads', 'threads']);
    expect(result.apiCalls).toBe(17);
    expect(result.platforms).toHaveLength(8);
    expect(result.valid).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/private-balance|private-auth|user_balance|access_token/);
  });
  it('never searches when authentication fails or the caller already cancelled', async () => {
    mock.client.getUserInfo.mockRejectedValue({ kind: 'auth', httpStatus: 401 });
    const failed = await runTikHubDiagnostics('offline', ['instagram']);
    expect(failed.tokenValid).toBe(false);
    expect(mock.client.searchInstagram).not.toHaveBeenCalled();
    mock.client.getUserInfo.mockClear();
    const controller = new AbortController(); controller.abort();
    await runTikHubDiagnostics('offline', ['instagram'], { signal: controller.signal });
    expect(mock.client.getUserInfo).not.toHaveBeenCalled();
  });
  it('does not use Instagram user pk as a comment identifier', async () => {
    mock.client.searchInstagram.mockResolvedValue({ items: [{ pk: '1234', user: { id: 'user1' } }] });
    const result = await runTikHubDiagnostics('offline', ['instagram']);
    expect(mock.client.getInstagramComments).not.toHaveBeenCalled();
    expect(result.platforms[0].comment.status).toBe('skipped');
  });
  it('shows scrubbed typed upstream failures but not arbitrary unknown messages', async () => {
    mock.client.searchInstagram.mockRejectedValue(new TikHubError('invalid keyword', { kind: 'business', httpStatus: 200, businessCode: 400, upstreamMessage: 'Invalid keyword' }));
    const result = await runTikHubDiagnostics('offline', ['instagram']);
    expect(result.platforms[0].search.message).toContain('Invalid keyword');
    expect(result.platforms[0].search.businessCode).toBe(400);
  });
  it('marks successful requests HTTP 200 and uses only the public XHS first-page method', async () => {
    mock.client.searchXhs.mockResolvedValue({ notes: [{ id: 'note1' }] });
    const result = await runTikHubDiagnostics('offline', ['xiaohongshu']);
    expect(result.platforms[0].comment.httpStatus).toBe(200);
    expect(mock.client.getXhsCommentsFirstPage).toHaveBeenCalledWith('note1', 1);
    expect(mock.client.request).not.toHaveBeenCalled();
  });
  it.each([['abc', 't3_abc'], ['t3_abc', 't3_abc'], ['t1_abc', null], ['t2_abc', null]])('normalizes Reddit %s safely', async (id, expected) => {
    mock.client.searchReddit.mockResolvedValue({ items: [{ post: { id } }] });
    await runTikHubDiagnostics('offline', ['reddit']);
    if (expected) expect(mock.client.getRedditComments).toHaveBeenCalledWith(expected, 1);
    else expect(mock.client.getRedditComments).not.toHaveBeenCalled();
  });
  it('authenticates once and never reports an empty search as comment success', async () => {
    const result = await runTikHubDiagnostics('offline', ['xiaohongshu', 'tiktok']);
    expect(mock.client.getUserInfo).toHaveBeenCalledTimes(1);
    expect(mock.options).toMatchObject({ timeoutMs: 8000, maxRetries: 0, maxRequests: 17, signal: expect.any(AbortSignal) });
    expect(result.apiCalls).toBe(3);
    expect(result.platforms[0].comment.status).toBe('skipped');
    expect(result.platforms[0].comment.apiCalls).toBe(0);
  });
  it.each([401, 402, 403, 422])('stops further paid calls on %i', async status => {
    mock.client.searchTikTok.mockImplementation(async () => { mock.client.stats.apiCalls++; throw { status, httpStatus: status, kind: 'http', message: 'offline' }; });
    const result = await runTikHubDiagnostics('offline', ['tiktok', 'youtube']);
    expect(result.valid).toBe(false);
    expect(mock.client.searchYouTube).not.toHaveBeenCalled();
    expect(result.platforms[1].search.status).toBe('skipped');
  });
  it('keeps network HTTP null and continues independent platforms without another keyword', async () => {
    mock.client.searchTikTok.mockRejectedValue({ httpStatus: null, kind: 'network', message: 'secret' });
    const result = await runTikHubDiagnostics('secret', ['tiktok', 'youtube']);
    expect(result.platforms[0].search).toMatchObject({ httpStatus: null, kind: 'network' });
    expect(mock.client.searchYouTube).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('extracts only platform post IDs, preserving Reddit fullname', async () => {
    mock.client.searchTikTok.mockResolvedValue({ items: [{ aweme_info: { aweme_id: 'tt1' } }] });
    mock.client.searchInstagram.mockResolvedValue({ items: [{ pk: 'user-id' }, { media: { shortcode: 'ig1' } }] });
    mock.client.searchYouTube.mockResolvedValue({ items: [{ video_id: 'yt1' }] });
    mock.client.searchReddit.mockResolvedValue({ items: [{ post: { id: 't3_rd1' } }] });
    await runTikHubDiagnostics('offline', ['tiktok', 'instagram', 'youtube', 'reddit']);
    expect(mock.client.getTikTokComments).toHaveBeenCalledWith('tt1', 1);
    expect(mock.client.getInstagramComments).toHaveBeenCalledWith('ig1', 1);
    expect(mock.client.getYouTubeComments).toHaveBeenCalledWith('yt1', 1);
    expect(mock.client.getRedditComments).toHaveBeenCalledWith('t3_rd1', 1);
  });
  it('does not treat XHS 400 as valid in legacy connection mode', async () => {
    mock.client.searchXhs.mockRejectedValue({ httpStatus: 400, status: 400, kind: 'http' });
    expect(await runTikHubDiagnostics('offline', ['xiaohongshu'], { commentProbe: false })).toMatchObject({ valid: false, tokenValid: true });
  });
});
