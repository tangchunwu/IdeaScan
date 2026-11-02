import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpportunityRequest } from '../types/opportunity';
import type { ChannelCrawlResult, UnifiedPost } from '../../supabase/functions/validate-idea/channels/types.ts';
import { collectOpportunitySources, safePublicHttpsUrl } from '../../supabase/functions/opportunity-discover/sources.ts';

const mocks = vi.hoisted(() => ({ crawl: vi.fn() }));
vi.mock('../../supabase/functions/validate-idea/channels/channel-registry.ts', () => ({
  MultiChannelOrchestrator: class { crawlMultipleChannels = mocks.crawl; },
}));

const request = (overrides: Partial<OpportunityRequest> = {}): OpportunityRequest => ({
  country: 'US', industry: 'pet care', keyword: 'appointment scheduling',
  mode: 'deep', platforms: [], ...overrides,
});
const post = (id: string, raw: Record<string, unknown> = {}): UnifiedPost => ({
  post_id: id, platform: 'xiaohongshu', title: '<b>Real title</b>', content: 'Real content',
  content_type: 'text', author: 'author',
  metrics: { likes: 100, comments: 999, shares: 1, collects: 1 }, raw_data: raw,
});
const result = (overrides: Partial<ChannelCrawlResult> = {}): ChannelCrawlResult => ({
  success: true, channel: 'xiaohongshu', posts: [], comments: [],
  stats: { total_posts: 99999, avg_likes: 0, avg_comments: 0, avg_shares: 0,
    avg_collects: 0, total_engagement: 99999, weekly_trend: [], content_types: [] },
  metadata: { api_calls: 7, crawl_time_ms: 0, rate_limited: false }, ...overrides,
});
const crawlResults = (...results: ChannelCrawlResult[]) => mocks.crawl.mockResolvedValue({
  success: true, results, combined_stats: { total_posts: 999999 },
  succeeded_channels: [], failed_channels: [],
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

beforeEach(() => {
  vi.stubGlobal('Deno', undefined);
  vi.stubGlobal('fetch', vi.fn());
  mocks.crawl.mockReset();
  crawlResults();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('safePublicHttpsUrl', () => {
  it.each([
    'http://example.com/a', 'javascript:alert(1)', '//example.com/a',
    'https://localhost/a', 'https://api.localhost/a', 'https://LOCALHOST./a',
    'https://printer.local/a', 'https://metadata.google.internal/a', 'https://intranet/a',
    'https://127.0.0.1/a', 'https://127.1/a', 'https://0x7f000001/a',
    'https://10.1.2.3/a', 'https://172.16.0.1/a', 'https://192.168.1.1/a',
    'https://169.254.169.254/a', 'https://100.64.0.1/a', 'https://0.0.0.0/a',
    'https://224.0.0.1/a', 'https://[::1]/a', 'https://[fc00::1]/a',
    'https://[::ffff:127.0.0.1]/a', 'https://user:pass@example.com/a',
    'https://example.com:8443/a', 'https://example.com\\@localhost/a',
    'https://exam\nple.com/a', '',
  ])('rejects unsafe URL %s', (url) => expect(safePublicHttpsUrl(url)).toBeNull());

  it('normalizes public HTTPS URLs without requesting them', () => {
    expect(safePublicHttpsUrl('https://EXAMPLE.com:443/a?q=1#part')).toBe('https://example.com/a?q=1');
    expect(safePublicHttpsUrl('https://8.8.8.8/public')).toBe('https://8.8.8.8/public');
    expect(safePublicHttpsUrl(null)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('web source collection', () => {
  it('uses each configured fixed endpoint once, with the original country/query and no China filters', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { webPages: { value: [{
        name: '<b>Bocha</b>', snippet: 'A &amp; B', url: 'https://news.example.org/bocha',
      }] } } }))
      .mockResolvedValueOnce(response({ results: { web: [{
        title: 'You', snippets: ['US demand'], url: 'https://news.example.org/you',
      }] } }))
      .mockResolvedValueOnce(response({ results: [{
        title: 'Tavily', content: 'Demand', url: 'https://news.example.org/tavily',
      }] }));
    const output = await collectOpportunitySources(request(), {
      bochaApiKey: 'bocha-secret', youApiKey: 'you-secret', tavilyApiKey: 'tavily-secret',
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls[0][0]).toBe('https://api.bochaai.com/v1/web-search');
    expect(JSON.parse(calls[0][1]!.body as string)).toEqual({
      query: 'US pet care appointment scheduling manual workflow pain points alternatives', freshness: 'noLimit', summary: true, count: 10,
    });
    expect(calls[0][1]!.headers).toMatchObject({ Authorization: 'Bearer bocha-secret' });
    const youUrl = new URL(calls[1][0] as string);
    expect(youUrl.origin + youUrl.pathname).toBe('https://ydc-index.io/v1/search');
    expect(Object.fromEntries(youUrl.searchParams)).toEqual({
      query: 'US pet care appointment scheduling manual workflow pain points alternatives', count: '10', country: 'US',
    });
    expect(calls[1][1]!.headers).toMatchObject({ 'X-API-Key': 'you-secret' });
    expect(calls[2][0]).toBe('https://api.tavily.com/search');
    expect(JSON.parse(calls[2][1]!.body as string)).toEqual({
      api_key: 'tavily-secret', query: 'US pet care appointment scheduling manual workflow pain points alternatives',
      search_depth: 'basic', max_results: 10, include_answer: false, include_images: false,
    });
    for (const [, init] of calls) {
      expect(init!.redirect).toBe('error');
      expect(init!.signal).toBeDefined();
    }
    expect(output).toMatchObject({ apiCalls: 3, postCount: 0, commentCount: 0, warnings: [] });
    expect(output.evidence).toHaveLength(3);
    expect(output.evidence[0]).toMatchObject({ title: 'Bocha', snippet: 'A & B', kind: 'fact' });
    expect(JSON.stringify(output)).not.toMatch(/secret|中国市场/);
    expect(mocks.crawl).not.toHaveBeenCalled();
  });

  it('skips unconfigured providers and uses a smaller quick result budget', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ results: [] }));
    await collectOpportunitySources(request({ mode: 'quick', country: 'United Kingdom', keyword: undefined }), {
      tavilyApiKey: 'key', bochaApiKey: '  ',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toMatchObject({
      query: 'United Kingdom pet care manual workflow pain points alternatives', max_results: 5,
    });
  });

  it('isolates HTTP, invalid JSON and transport failures, counting failed attempts without exposing errors', async () => {
    const log = vi.spyOn(console, 'error');
    const warn = vi.spyOn(console, 'warn');
    const errorResponse = response({ token: 'sensitive-upstream-error' }, 401);
    const readBody = vi.spyOn(errorResponse, 'text');
    vi.mocked(fetch)
      .mockResolvedValueOnce(errorResponse)
      .mockResolvedValueOnce(new Response('not-json-sensitive-upstream-error'))
      .mockRejectedValueOnce(new Error('sensitive-upstream-error'));
    const output = await collectOpportunitySources(request(), {
      bochaApiKey: 'b', youApiKey: 'y', tavilyApiKey: 't',
    });
    expect(output.apiCalls).toBe(3);
    expect(output.evidence).toEqual([]);
    expect(output.warnings).toHaveLength(3);
    expect(JSON.stringify(output)).not.toContain('sensitive-upstream-error');
    expect(readBody).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('preserves healthy web results when another provider fails', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('private')).mockResolvedValueOnce(response({
      results: [{ title: 'ok', content: 'verified', url: 'https://example.org/source' }],
    }));
    const output = await collectOpportunitySources(request(), { bochaApiKey: 'b', tavilyApiKey: 't' });
    expect(output.apiCalls).toBe(2);
    expect(output.evidence).toHaveLength(1);
    expect(output.warnings).toHaveLength(1);
  });

  it('times out after 20 seconds even if a fetch mock ignores abort, without retrying', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    const pending = collectOpportunitySources(request(), { tavilyApiKey: 'key' });
    await vi.advanceTimersByTimeAsync(20_000);
    const output = await pending;
    expect(output.apiCalls).toBe(1);
    expect(output.warnings).toHaveLength(1);
    expect(vi.mocked(fetch).mock.calls[0][1]!.signal!.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('also applies the deadline while reading a successful response body', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: () => new Promise(() => {}) } as Response);
    const pending = collectOpportunitySources(request(), { youApiKey: 'key' });
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await pending).warnings).toHaveLength(1);
  });

  it('drops unsafe URLs, cleans and truncates text, and never fetches evidence URLs', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ results: [
      { title: '<script>steal()</script><b>Good</b>\u0000' + 'x'.repeat(500),
        content: '<style>bad</style>safe\n' + 'x'.repeat(2000), url: 'https://example.org/good' },
      { title: 'bad', url: 'https://127.0.0.1/private' },
      { title: 'missing' }, null,
    ] }));
    const output = await collectOpportunitySources(request(), { tavilyApiKey: 'key' });
    expect(output.evidence).toHaveLength(1);
    const evidence = output.evidence[0];
    expect(evidence.title.length).toBeLessThanOrEqual(180);
    expect(evidence.snippet.length).toBeLessThanOrEqual(1200);
    expect(evidence.title).not.toMatch(/steal|</);
    expect(evidence.title).not.toContain('\u0000');
    expect(evidence.snippet).not.toContain('bad');
    expect(output.warnings.length).toBeGreaterThan(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reports malformed provider envelopes instead of treating them as successful empty results', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ error: 'private-body' }));
    const output = await collectOpportunitySources(request(), { bochaApiKey: 'key' });
    expect(output).toMatchObject({ apiCalls: 1, evidence: [] });
    expect(output.warnings).toHaveLength(1);
    expect(JSON.stringify(output)).not.toContain('private-body');
  });

  it('adds Chinese demand intent only to web queries and keeps social queries short', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ results: [] }));
    await collectOpportunitySources(request({ country: '日本', industry: '宠物护理', keyword: '预约管理',
      platforms: ['xiaohongshu'],
    }), { tikhubToken: 'token', tavilyApiKey: 'key' });
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).query)
      .toBe('日本 宠物护理 预约管理 手工 低效 替代');
    expect(mocks.crawl.mock.calls[0][0].keyword).toBe('日本 宠物护理 预约管理');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.crawl).toHaveBeenCalledTimes(1);
  });
});

describe('social source collection', () => {
  it('uses canonical public routes only for well-shaped platform IDs, not opaque IDs', async () => {
    vi.stubGlobal('Deno', { env: { get: () => 'true' } });
    crawlResults(
      result({ channel: 'youtube', posts: [{ ...post('AbCdEf_12-3'), platform: 'youtube' }, { ...post('opaque'), platform: 'youtube' }] }),
      result({ channel: 'instagram', posts: [{ ...post('123456789', { media: { code: 'ABCdef_12' } }), platform: 'instagram' }, { ...post('987654321'), platform: 'instagram' }] }),
    );
    const output = await collectOpportunitySources(request({ platforms: ['youtube', 'instagram'] }), { tikhubToken: 'token' });
    expect(output.evidence.map(e => e.url)).toEqual(['https://www.youtube.com/watch?v=AbCdEf_12-3', 'https://www.instagram.com/p/ABCdef_12/']);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not call social without a token, and tolerates missing Deno in Vitest', async () => {
    const output = await collectOpportunitySources(request({ platforms: ['xiaohongshu', 'reddit'] }), {});
    expect(mocks.crawl).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(output).toMatchObject({ apiCalls: 0, postCount: 0, commentCount: 0 });
    expect(output.warnings.length).toBeGreaterThan(0);
  });

  it('keeps domestic channels enabled with the overseas flag off and ignores duplicate selections', async () => {
    await collectOpportunitySources(request({ platforms: ['xiaohongshu', 'douyin', 'reddit', 'douyin'] }), {
      tikhubToken: 'token',
    });
    expect(mocks.crawl).toHaveBeenCalledTimes(1);
    expect(mocks.crawl.mock.calls[0][0]).toEqual({
      keyword: 'US pet care appointment scheduling',
      channels: ['xiaohongshu', 'douyin'].map(type => ({ type, config: {
        auth_token: 'token', mode: 'deep', max_posts: 5, max_comments_per_post: 10,
      } })),
    });
  });

  it('does not invoke social when no platforms are selected or all are gated', async () => {
    await collectOpportunitySources(request(), { tikhubToken: 'token' });
    await collectOpportunitySources(request({ platforms: ['youtube'] }), { tikhubToken: 'token' });
    expect(mocks.crawl).not.toHaveBeenCalled();
  });

  it('enables selected overseas channels only via an exact true flag and uses adapter-specific budgets', async () => {
    vi.stubGlobal('Deno', { env: { get: vi.fn(() => 'true') } });
    await collectOpportunitySources(request({ platforms: ['youtube', 'reddit'] }), { tikhubToken: 'token' });
    expect(mocks.crawl.mock.calls[0][0].channels).toEqual(['youtube', 'reddit'].map(type => ({
      type, config: { auth_token: 'token', mode: 'deep', max_posts: 10, max_comments_per_post: 10 },
    })));
    await collectOpportunitySources(request({ mode: 'quick', platforms: ['youtube', 'xiaohongshu'] }), {
      tikhubToken: 'token',
    });
    expect(mocks.crawl.mock.calls[1][0].channels).toEqual(['youtube', 'xiaohongshu'].map(type => ({
      type, config: { auth_token: 'token', mode: 'quick', max_posts: 3, max_comments_per_post: 4 },
    })));
  });

  it('treats denied environment access as a closed overseas gate', async () => {
    vi.stubGlobal('Deno', { env: { get: () => { throw new Error('denied'); } } });
    await collectOpportunitySources(request({ platforms: ['reddit'] }), { tikhubToken: 'token' });
    expect(mocks.crawl).not.toHaveBeenCalled();
  });

  it('reads raw URLs, keeps comments on parent URLs, and counts real samples plus failed metadata calls', async () => {
    crawlResults(result({ posts: [
      post('one', { share_url: 'https://www.xiaohongshu.com/explore/one' }),
      post('two', { share_info: { share_url: 'https://www.xiaohongshu.com/explore/two' } }),
      post('no-url'), post('unsafe', { web_url: 'https://localhost/private' }),
    ], comments: [
      { comment_id: 'c1', platform: 'xiaohongshu', post_id: 'one', content: 'Need help', author: '', metrics: { likes: 3 } },
      { comment_id: 'c2', platform: 'xiaohongshu', post_id: 'no-url', content: 'No source', author: '', metrics: { likes: 3 } },
    ] }), result({ channel: 'douyin', success: false, error: 'private-upstream-error',
      metadata: { api_calls: 2, failed_calls: 2, crawl_time_ms: 0, rate_limited: true },
    }));
    const output = await collectOpportunitySources(request({ platforms: ['xiaohongshu', 'douyin'] }), { tikhubToken: 'token' });
    expect(output).toMatchObject({ postCount: 4, commentCount: 2, apiCalls: 9 });
    expect(output.evidence).toHaveLength(3);
    expect(output.evidence[2].url).toBe(output.evidence[0].url);
    expect(new Set(output.evidence.map(item => item.id)).size).toBe(3);
    expect(output.warnings.length).toBeGreaterThan(0);
    expect(JSON.stringify(output)).not.toContain('private-upstream-error');
  });

  it('accepts raw wrapper links and canonical video IDs, leaving source deduplication to the core', async () => {
    vi.stubGlobal('Deno', { env: { get: () => 'true' } });
    crawlResults(result({ channel: 'reddit', posts: [
      { ...post('r1', { data: { permalink: '/r/pets/comments/abc/real/' } }), platform: 'reddit' },
      { ...post('r2', { data: { permalink: '//evil.example.org/path' } }), platform: 'reddit' },
    ] }), result({ channel: 'instagram', posts: [
      { ...post('i1', { media: { permalink: 'https://www.instagram.com/p/abc/' } }), platform: 'instagram' },
    ] }), result({ channel: 'youtube', posts: [
      { ...post('dQw4w9WgXcQ'), platform: 'youtube' },
      { ...post('y2', { video: { web_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } }), platform: 'youtube' },
    ] }));
    const output = await collectOpportunitySources(request({ platforms: ['reddit', 'instagram', 'youtube'] }), {
      tikhubToken: 'token',
    });
    expect(output.evidence.map(item => item.url)).toEqual([
      'https://www.reddit.com/r/pets/comments/abc/real/',
      'https://www.instagram.com/p/abc/', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    ]);
    expect(output.postCount).toBe(5);
    expect(output.warnings.length).toBeGreaterThan(0);
  });

  it('bounds retained samples to ten posts and ten comments on each of five posts', async () => {
    const posts = Array.from({ length: 15 }, (_, i) => post(String(i), { share_url: `https://example.org/${i}` }));
    const comments = posts.flatMap(p => Array.from({ length: 15 }, (_, i) => ({
      comment_id: `${p.post_id}-${i}`, platform: 'xiaohongshu' as const, post_id: p.post_id,
      content: 'comment', author: '', metrics: { likes: 0 },
    })));
    crawlResults(result({ posts, comments }));
    const output = await collectOpportunitySources(request({ platforms: ['xiaohongshu'] }), { tikhubToken: 'token' });
    expect(output).toMatchObject({ postCount: 10, commentCount: 50, apiCalls: 7 });
    expect(output.evidence).toHaveLength(60);
    const quick = await collectOpportunitySources(request({ mode: 'quick', platforms: ['xiaohongshu'] }), { tikhubToken: 'token' });
    expect(quick).toMatchObject({ postCount: 5, commentCount: 12 });
  });

  it('isolates orchestrator failure from web collection without exposing rejection details', async () => {
    mocks.crawl.mockRejectedValue(new Error('token=secret'));
    vi.mocked(fetch).mockResolvedValue(response({ results: [{
      title: 'Good', content: 'Useful', url: 'https://example.org/source',
    }] }));
    const output = await collectOpportunitySources(request({ platforms: ['douyin'] }), {
      tikhubToken: 'token', tavilyApiKey: 'key',
    });
    expect(output.evidence).toHaveLength(1);
    expect(output.apiCalls).toBe(1);
    expect(output.warnings).toHaveLength(1);
    expect(JSON.stringify(output)).not.toContain('secret');
  });
});
