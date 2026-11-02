import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { channelRegistry, multiChannelOrchestrator } from '../../supabase/functions/_shared/channels/channel-registry.ts';
import { InstagramAdapter } from '../../supabase/functions/_shared/channels/instagram-adapter.ts';
import { RedditAdapter } from '../../supabase/functions/_shared/channels/reddit-adapter.ts';
import { TikTokAdapter } from '../../supabase/functions/_shared/channels/tiktok-adapter.ts';
import { YouTubeAdapter } from '../../supabase/functions/_shared/channels/youtube-adapter.ts';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('../../supabase/functions/_shared/tikhub-client.ts', () => ({
  TikHubClient: class {
    constructor(token: string) {
      return mocks.createClient(token);
    }
  },
}));

type CrawlRequest = { keyword: string; config: { auth_token: string; mode: 'deep' } };

const request = (token = 'test-token'): CrawlRequest => ({
  keyword: 'home office',
  config: { auth_token: token, mode: 'deep' as const },
});

const searchItem = (platform: string, id: string) => ({
  id,
  aweme_id: id,
  video_id: id,
  shortcode: id,
  code: id,
  title: `${platform} title ${id}`,
  desc: `${platform} content ${id}`,
  text: `${platform} content ${id}`,
  caption: `${platform} content ${id}`,
  description: `${platform} content ${id}`,
  author: { nickname: `author ${id}`, username: `user_${id}`, name: `name ${id}` },
  statistics: { digg_count: 12, comment_count: 4, share_count: 3, collect_count: 2, play_count: 100 },
  like_count: 12,
  comment_count: 4,
  comments_count: 4,
  share_count: 3,
  view_count: 100,
  thumbnail: `https://example.com/${id}.jpg`,
});

const commentItem = (id: string) => ({
  id,
  cid: id,
  comment_id: id,
  text: `comment ${id}`,
  content: `comment ${id}`,
  author: { nickname: `commenter ${id}`, username: `commenter_${id}` },
  user: { nickname: `commenter ${id}`, username: `commenter_${id}` },
  like_count: 7,
  digg_count: 7,
  created_at: '2026-01-02T03:04:05.000Z',
});

type AdapterConstructor = new () => {
  crawl(request: CrawlRequest): Promise<any>;
};

type PlatformCase = {
  name: string;
  channel: 'tiktok' | 'instagram' | 'youtube' | 'reddit';
  Adapter: AdapterConstructor;
  searchMethod: string;
  commentMethod: string;
  firstPage: Record<string, unknown>;
  secondPage: Record<string, unknown>;
  expectedSecondArgs: unknown[];
  posts: unknown[];
  comments: unknown[];
};

const platformCases: PlatformCase[] = [
  {
    name: 'TikTok', channel: 'tiktok', Adapter: TikTokAdapter,
    searchMethod: 'searchTikTok', commentMethod: 'getTikTokComments',
    firstPage: { items: [searchItem('tiktok', 'tt-1'), searchItem('tiktok', 'tt-1')], hasMore: true, nextOffset: 20 },
    secondPage: { items: Array.from({ length: 11 }, (_, i) => searchItem('tiktok', `tt-${i + 1}`)), hasMore: false, nextOffset: 40 },
    expectedSecondArgs: ['home office', { offset: 20, count: 20, region: 'US' }],
    posts: [], comments: [],
  },
  {
    name: 'Instagram', channel: 'instagram', Adapter: InstagramAdapter,
    searchMethod: 'searchInstagram', commentMethod: 'getInstagramComments',
    firstPage: { items: [searchItem('instagram', 'ig-1'), searchItem('instagram', 'ig-1')], hasMore: true, nextToken: 'ig-next' },
    secondPage: { items: Array.from({ length: 11 }, (_, i) => searchItem('instagram', `ig-${i + 1}`)), hasMore: false },
    expectedSecondArgs: ['home office', { mode: 'general', paginationToken: 'ig-next' }],
    posts: [], comments: [],
  },
  {
    name: 'YouTube', channel: 'youtube', Adapter: YouTubeAdapter,
    searchMethod: 'searchYouTube', commentMethod: 'getYouTubeComments',
    firstPage: { items: [searchItem('youtube', 'yt-1'), searchItem('youtube', 'yt-1')], hasMore: true, nextToken: 'yt-next' },
    secondPage: { items: Array.from({ length: 11 }, (_, i) => searchItem('youtube', `yt-${i + 1}`)), hasMore: false },
    expectedSecondArgs: ['home office', { continuationToken: 'yt-next' }],
    posts: [], comments: [],
  },
  {
    name: 'Reddit', channel: 'reddit', Adapter: RedditAdapter,
    searchMethod: 'searchReddit', commentMethod: 'getRedditComments',
    firstPage: { items: [searchItem('reddit', 'abc1'), searchItem('reddit', 'abc1')], hasMore: true, nextAfter: 'rd-next' },
    secondPage: { items: Array.from({ length: 11 }, (_, i) => searchItem('reddit', `abc${i + 1}`)), hasMore: false },
    expectedSecondArgs: ['home office', { after: 'rd-next' }],
    posts: [], comments: [],
  },
];

describe('overseas channel adapters', () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it('registers all four overseas adapters', () => {
    expect(channelRegistry.getAvailableChannels().map((channel) => channel.type)).toEqual(expect.arrayContaining(['tiktok', 'instagram', 'youtube', 'reddit']));
  });

  it.each(platformCases)('$name uses the shared client, caps samples, deduplicates and binds comments', async (testCase) => {
    const client: Record<string, any> = {
      stats: { apiCalls: 14, failedCalls: 1, retries: 1, rateLimited: false },
    };
    client[testCase.searchMethod] = vi.fn().mockResolvedValueOnce(testCase.firstPage).mockResolvedValueOnce(testCase.secondPage);
    client[testCase.commentMethod] = vi.fn((postId: string) => Promise.resolve(
      Array.from({ length: 11 }, (_, i) => commentItem(testCase.channel === 'reddit' ? `t1_${postId.slice(3)}c${i}` : `${postId}-c-${i}`)),
    ));
    mocks.createClient.mockReturnValue(client);

    const result = await new testCase.Adapter().crawl(request());

    expect(mocks.createClient).toHaveBeenCalledWith('test-token');
    expect(client[testCase.searchMethod]).toHaveBeenCalledTimes(2);
    expect(client[testCase.searchMethod].mock.calls[1]).toEqual(testCase.expectedSecondArgs);
    expect(result.success).toBe(true);
    expect(result.channel).toBe(testCase.channel);
    expect(result.posts).toHaveLength(10);
    expect(new Set(result.posts.map((post: any) => post.post_id)).size).toBe(10);
    expect(client[testCase.commentMethod]).toHaveBeenCalledTimes(5);
    expect(result.comments).toHaveLength(50);
    expect(result.comments.every((comment: any) => comment.post_id)).toBe(true);
    expect(result.comments.every((comment: any) => result.posts.some((post: any) => post.post_id === comment.post_id))).toBe(true);
    expect(result.posts.every((post: any) => post.platform === testCase.channel)).toBe(true);
    expect(result.comments.every((comment: any) => comment.platform === testCase.channel)).toBe(true);
    expect(result.metadata).toMatchObject({ api_calls: 14, failed_calls: 1, retries: 1, rate_limited: false });
  });

  it('marks one failed platform unsuccessful without preventing another platform', async () => {
    const failedClient: Record<string, any> = {
      stats: { apiCalls: 1, failedCalls: 1, retries: 0, rateLimited: false },
      searchTikTok: vi.fn().mockRejectedValue(new Error('TikHub unavailable')),
    };
    const goodClient: Record<string, any> = {
      stats: { apiCalls: 1, failedCalls: 0, retries: 0, rateLimited: false },
      searchInstagram: vi.fn().mockResolvedValue({ items: [searchItem('instagram', 'ig-1')], hasMore: false }),
      getInstagramComments: vi.fn().mockResolvedValue([]),
    };
    mocks.createClient.mockImplementation((token: string) => token === 'bad-token' ? failedClient : goodClient);

    const result = await multiChannelOrchestrator.crawlMultipleChannels({
      keyword: 'home office',
      channels: [
        { type: 'tiktok', config: { auth_token: 'bad-token', mode: 'quick' } },
        { type: 'instagram', config: { auth_token: 'good-token', mode: 'quick' } },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.failed_channels).toEqual([{ channel: 'tiktok', error: 'TikHub unavailable' }]);
    expect(result.succeeded_channels).toEqual(['instagram']);
    expect(result.results.find((item) => item.channel === 'tiktok')).toMatchObject({ success: false });
    expect(result.results.find((item) => item.channel === 'instagram')).toMatchObject({ success: true, posts: [{ post_id: 'ig-1' }] });
  });
});
