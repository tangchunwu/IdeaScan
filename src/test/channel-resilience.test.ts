import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TwitterAdapter } from '../../supabase/functions/_shared/channels/twitter-adapter';
import { ThreadsAdapter } from '../../supabase/functions/_shared/channels/threads-adapter';
import { TikTokAdapter } from '../../supabase/functions/_shared/channels/tiktok-adapter';
import { InstagramAdapter } from '../../supabase/functions/_shared/channels/instagram-adapter';
import { YouTubeAdapter } from '../../supabase/functions/_shared/channels/youtube-adapter';
import { RedditAdapter } from '../../supabase/functions/_shared/channels/reddit-adapter';
const mock = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock('../../supabase/functions/_shared/tikhub-client.ts', () => ({ TikHubClient: class { constructor() { return mock.client(); } } }));
beforeEach(() => mock.client.mockReset());
const req = { keyword: 'home office', config: { auth_token: 'offline', mode: 'deep' as const, countryCode: 'JP', language: 'ja' } };
describe('渠道部分失败保留证据', () => {
  it.each([
    [TwitterAdapter, 'searchTwitter', 'getTwitterComments', { tweet_id: '1234567890123456789', text: '有意义原文' }],
    [ThreadsAdapter, 'searchThreads', 'getThreadsComments', { pk: '3390920896561588969', code: 'AbcDEf', caption: { text: '原文' } }],
    [TikTokAdapter, 'searchTikTok', 'getTikTokComments', { aweme_id: '1234567890123456789', desc: '原文' }],
    [InstagramAdapter, 'searchInstagram', 'getInstagramComments', { code: 'AbcDEf', caption: { text: '原文' } }],
    [YouTubeAdapter, 'searchYouTube', 'getYouTubeComments', { video_id: 'dQw4w9WgXcQ', title: '原文' }],
    [RedditAdapter, 'searchReddit', 'getRedditComments', { id: 'abc123', title: '原文' }],
  ] as const)('%s 评论失败仍保留已采帖子并标记不完整', async (Adapter, search, comments, item) => {
    mock.client.mockReturnValue({ stats: { apiCalls: 2, failedCalls: 1, retries: 0, rateLimited: false },
      [search]: vi.fn().mockResolvedValue({ items: [item], hasMore: false }),
      [comments]: vi.fn().mockRejectedValue(new Error('HTTP 400')) });
    const result = await new Adapter().crawl(req);
    expect(result.posts).toHaveLength(1);
    expect(result.metadata?.partial).toBe(true);
    expect(result.metadata?.warnings?.length).toBeGreaterThan(0);
  });
  it('Threads评论使用数字ID，原文路由仍保留shortcode', async () => {
    const comments = vi.fn().mockResolvedValue([]);
    mock.client.mockReturnValue({ stats: { apiCalls: 2, failedCalls: 0, retries: 0, rateLimited: false },
      searchThreads: vi.fn().mockResolvedValue({ items: [{ pk: '3390920896561588969', code: 'AbcDEf', caption: { text: '原文' } }], hasMore: false }), getThreadsComments: comments });
    const result = await new ThreadsAdapter().crawl(req);
    expect(comments).toHaveBeenCalledWith('3390920896561588969', 10);
    expect(result.posts[0].raw_data?.code).toBe('AbcDEf');
    expect(result.stats.total_posts).toBe(1);
    expect(result.stats.weekly_trend).toEqual([]);
  });
  it('TikTok地域使用明确选择的日本', async () => {
    const search = vi.fn().mockResolvedValue({ items: [], hasMore: false });
    mock.client.mockReturnValue({ stats: { apiCalls: 1, failedCalls: 0, retries: 0, rateLimited: false }, searchTikTok: search });
    await new TikTokAdapter().crawl(req);
    expect(search.mock.calls[0][1].region).toBe('JP');
  });
  it('YouTube后续页失败仍保留第一页证据',async()=>{
    const search=vi.fn().mockResolvedValueOnce({items:[{video_id:'dQw4w9WgXcQ',title:'第一批原文'}],hasMore:true,continuationToken:'next'}).mockRejectedValueOnce(new Error('network'));
    mock.client.mockReturnValue({stats:{apiCalls:3,failedCalls:1,retries:0,rateLimited:false},searchYouTube:search,getYouTubeComments:vi.fn().mockResolvedValue([])});
    const result=await new YouTubeAdapter().crawl(req);
    expect(result.posts[0].title).toBe('第一批原文');
    expect(result.metadata?.partial).toBe(true);
  });
});
