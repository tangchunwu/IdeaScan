import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseChannelAdapter } from '../../supabase/functions/_shared/channels/base-adapter.ts';
import { XiaohongshuAdapter } from '../../supabase/functions/_shared/channels/xiaohongshu-adapter.ts';
import { DouyinAdapter } from '../../supabase/functions/_shared/channels/douyin-adapter.ts';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('../../supabase/functions/_shared/tikhub-client.ts', () => ({
  TikHubError: class TikHubError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TikHubError';
    }
  },
  TikHubClient: class {
    constructor(token: string, options?: unknown) {
      return mocks.createClient(token, options);
    }
  },
}));

const note = (id: string) => ({
  id, title: `标题 ${id}`, desc: `内容 ${id}`, type: 'normal',
  liked_count: '10', collected_count: 4, comments_count: 2, shared_count: 1,
  user: { nickname: `用户 ${id}` },
});
const xhsComment = (id: string) => ({
  id, content: `评论 ${id}`, like_count: '3',
  user: { nickname: `评论用户 ${id}` }, ip_location: '上海',
});
const video = (id: string) => ({
  aweme_id: id, desc: `视频 ${id}`, author: { nickname: `作者 ${id}` },
  statistics: { digg_count: '12', comment_count: 5, share_count: 2, collect_count: 1, play_count: 100 },
  create_time: 1_700_000_000,
});
const dyComment = (id: string) => ({
  cid: id, text: `评论 ${id}`, digg_count: '2',
  user: { nickname: '评论用户' }, ip_label: '北京', create_time: 1_700_000_000,
});

function createClient() {
  const client = {
    stats: { apiCalls: 0, failedCalls: 0, retries: 0, rateLimited: false },
    searchXhs: vi.fn().mockResolvedValue({
      notes: [], total: 0, hasMore: false, searchId: '', searchSessionId: '',
    }),
    getXhsComments: vi.fn().mockResolvedValue([]),
    searchDouyin: vi.fn().mockResolvedValue({
      videos: [], hasMore: false, pagination: { offset: 0, page: 1, searchId: '', backtrace: '' },
    }),
    getDouyinComments: vi.fn().mockResolvedValue([]),
  };
  mocks.createClient.mockReturnValueOnce(client);
  return client;
}

const request = (token = 'test-token', mode: 'quick' | 'deep' = 'deep') => ({
  keyword: '智能家居',
  config: { auth_token: token, mode, max_posts: 10, max_comments_per_post: 20 },
});

describe('TikHub channel adapters', () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    vi.spyOn(BaseChannelAdapter.prototype, 'sleep' as never).mockResolvedValue(undefined as never);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('适配器不得绕过共享 client'); }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('传递 XHS 搜索会话，去重笔记并保留每条评论的真实父笔记', async () => {
    const client = createClient();
    client.searchXhs
      .mockResolvedValueOnce({ notes: [note('n1')], total: 2, hasMore: true, searchId: 's1', searchSessionId: 'ss1' })
      .mockResolvedValueOnce({ notes: [note('n1'), note('n2'), { id: '' }], total: 2, hasMore: false });
    client.getXhsComments
      .mockResolvedValueOnce([xhsComment('c1'), xhsComment('c1'), { id: '' }])
      .mockResolvedValueOnce([xhsComment('c2')]);
    client.stats = { apiCalls: 7, failedCalls: 2, retries: 2, rateLimited: true };

    const result = await new XiaohongshuAdapter().crawl(request());

    expect(mocks.createClient).toHaveBeenCalledWith('test-token', undefined);
    expect(client.searchXhs.mock.calls).toEqual([
      ['智能家居'], ['智能家居', { page: 2, searchId: 's1', searchSessionId: 'ss1' }],
    ]);
    expect(client.getXhsComments.mock.calls).toEqual([['n1', 20], ['n2', 20]]);
    expect(result.posts.map((post) => post.post_id)).toEqual(['n1', 'n2']);
    expect(result.posts[0]).toMatchObject({
      platform: 'xiaohongshu', title: '标题 n1', content: '内容 n1', author: '用户 n1',
      content_type: 'image', metrics: { likes: 10, comments: 2, shares: 1, collects: 4 },
    });
    expect(result.comments.map((comment) => [comment.comment_id, comment.post_id])).toEqual([
      ['c1', 'n1'], ['c2', 'n2'],
    ]);
    expect(result.comments[1]).toMatchObject({ content: '评论 c2', metrics: { likes: 3 }, location: '上海' });
    expect(result.metadata).toMatchObject({ api_calls: 7, failed_calls: 2, retries: 2, rate_limited: true });
    expect(result.success).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('抖音翻页传递完整 V5 状态，包括 offset 为零时的搜索会话', async () => {
    const client = createClient();
    const pagination = { offset: 0, page: 2, searchId: 's1', backtrace: 'bt1' };
    client.searchDouyin
      .mockResolvedValueOnce({ videos: [video('v1')], hasMore: true, pagination })
      .mockResolvedValueOnce({ videos: [video('v1'), video('v2'), { aweme_id: '' }], hasMore: false });
    client.getDouyinComments
      .mockResolvedValueOnce([dyComment('c1'), dyComment('c1'), { cid: '' }])
      .mockResolvedValueOnce([dyComment('c2')]);
    client.stats = { apiCalls: 6, failedCalls: 1, retries: 1, rateLimited: true };

    const result = await new DouyinAdapter().crawl(request());

    expect(client.searchDouyin.mock.calls).toEqual([['智能家居'], ['智能家居', pagination]]);
    expect(client.getDouyinComments.mock.calls).toEqual([['v1', 20], ['v2', 20]]);
    expect(result.posts.map((post) => post.post_id)).toEqual(['v1', 'v2']);
    expect(result.posts[0]).toMatchObject({
      platform: 'douyin', content_type: 'video', author: '作者 v1',
      metrics: { likes: 12, comments: 5, shares: 2, collects: 1, views: 100 },
      created_at: '2023-11-14T22:13:20.000Z',
    });
    expect(result.comments.map((comment) => [comment.comment_id, comment.post_id])).toEqual([
      ['c1', 'v1'], ['c2', 'v2'],
    ]);
    expect(result.metadata).toMatchObject({ api_calls: 6, failed_calls: 1, retries: 1, rate_limited: true });
    expect(result.success).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['小红书', XiaohongshuAdapter, 'searchXhs'],
    ['抖音', DouyinAdapter, 'searchDouyin'],
  ] as const)('%s 首次搜索失败不得标为成功，仍返回实际请求统计', async (_label, Adapter, search) => {
    const client = createClient();
    client[search].mockRejectedValueOnce(new Error('TikHub search failed'));
    client.stats = { apiCalls: 4, failedCalls: 4, retries: 3, rateLimited: true };

    const result = await new Adapter().crawl(request());

    expect(result).toMatchObject({
      success: false, error: 'TikHub search failed', posts: [], comments: [],
      metadata: { api_calls: 4, failed_calls: 4, retries: 3, rate_limited: true },
    });
    expect(client.getXhsComments).not.toHaveBeenCalled();
    expect(client.getDouyinComments).not.toHaveBeenCalled();
  });

  it.each([
    ['小红书', XiaohongshuAdapter, 'searchXhs', 'getXhsComments'],
    ['抖音', DouyinAdapter, 'searchDouyin', 'getDouyinComments'],
  ] as const)('%s 单条评论失败不丢失已取得的样本', async (_label, Adapter, search, getComments) => {
    const client = createClient();
    const page = search === 'searchXhs'
      ? { notes: [note('p1'), note('p2')], hasMore: false, searchId: 's', searchSessionId: 'ss' }
      : { videos: [video('p1'), video('p2')], hasMore: false, pagination: { offset: 10, page: 2, searchId: 's', backtrace: 'b' } };
    client[search].mockResolvedValueOnce(page);
    client[getComments].mockRejectedValueOnce(new Error('comment failed'))
      .mockResolvedValueOnce([getComments === 'getXhsComments' ? xhsComment('c2') : dyComment('c2')]);
    client.stats = { apiCalls: 4, failedCalls: 2, retries: 0, rateLimited: false };

    const result = await new Adapter().crawl(request());

    expect(result.success).toBe(true);
    expect(result.posts.map((post) => post.post_id)).toEqual(['p1', 'p2']);
    expect(result.comments.map((comment) => comment.post_id)).toEqual(['p2']);
    expect(result.metadata).toMatchObject({ api_calls: 4, failed_calls: 2 });
  });

  it.each([
    ['小红书', XiaohongshuAdapter, 'searchXhs'],
    ['抖音', DouyinAdapter, 'searchDouyin'],
  ] as const)('%s 翻页搜索失败不得标为成功', async (_label, Adapter, search) => {
    const client = createClient();
    const firstPage = search === 'searchXhs'
      ? { notes: [note('p1')], hasMore: true, searchId: 's', searchSessionId: 'ss' }
      : { videos: [video('p1')], hasMore: true, pagination: { offset: 10, page: 2, searchId: 's', backtrace: 'b' } };
    client[search].mockResolvedValueOnce(firstPage).mockRejectedValueOnce(new Error('page failed'));
    client.stats = { apiCalls: 3, failedCalls: 1, retries: 0, rateLimited: false };

    const result = await new Adapter().crawl(request());

    expect(result).toMatchObject({
      success: false, error: 'page failed', posts: [], comments: [],
      metadata: { api_calls: 3, failed_calls: 1 },
    });
  });

  it.each([
    ['小红书', XiaohongshuAdapter, 'searchXhs'],
    ['抖音', DouyinAdapter, 'searchDouyin'],
  ] as const)('%s 不对没有更多数据的空搜索继续翻页', async (_label, Adapter, search) => {
    const client = createClient();
    const result = await new Adapter().crawl(request());
    expect(client[search]).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.posts).toEqual([]);
  });

  it('抖音快速模式不翻第二页，评论请求遵循数量上限', async () => {
    const client = createClient();
    client.searchDouyin.mockResolvedValueOnce({ videos: [video('v1'), video('v2')], hasMore: true });
    client.getDouyinComments.mockResolvedValueOnce([dyComment('c1'), dyComment('c2')]);
    const crawlRequest = request('token', 'quick');
    crawlRequest.config.max_posts = 1;
    crawlRequest.config.max_comments_per_post = 1;

    const result = await new DouyinAdapter().crawl(crawlRequest);

    expect(client.searchDouyin).toHaveBeenCalledTimes(1);
    expect(client.getDouyinComments.mock.calls).toEqual([['v1', 1]]);
    expect(result.posts).toHaveLength(2);
    expect(result.comments).toHaveLength(1);
  });

  it('XHS 保持最多两页预算，max_posts 只限制拉取评论的笔记数量', async () => {
    const client = createClient();
    client.searchXhs
      .mockResolvedValueOnce({ notes: [note('n1')], hasMore: true, searchId: 's', searchSessionId: 'ss' })
      .mockResolvedValueOnce({ notes: [note('n2')], hasMore: true });
    const crawlRequest = request('token', 'quick');
    crawlRequest.config.max_posts = 1;

    const result = await new XiaohongshuAdapter().crawl(crawlRequest);

    expect(client.searchXhs).toHaveBeenCalledTimes(2);
    expect(client.getXhsComments.mock.calls).toEqual([['n1', 20]]);
    expect(result.posts).toHaveLength(2);
  });

  it.each([XiaohongshuAdapter, DouyinAdapter])('没有密钥时不创建 client', async (Adapter) => {
    const adapter = new Adapter();
    expect(adapter.isConfigured()).toBe(false);
    const result = await adapter.crawl(request(''));
    expect(result.success).toBe(false);
    expect(mocks.createClient).not.toHaveBeenCalled();
    adapter.setAuthToken('instance-token');
    expect(adapter.isConfigured()).toBe(true);
  });

  it.each([
    [XiaohongshuAdapter, 'searchXhs'], [DouyinAdapter, 'searchDouyin'],
  ] as const)('同一适配器并发 crawl 的密钥与统计互不污染', async (Adapter, search) => {
    const first = createClient();
    const second = createClient();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    first[search].mockImplementationOnce(async () => {
      await gate;
      return { notes: [], videos: [], hasMore: false };
    });
    first.stats = { apiCalls: 4, failedCalls: 3, retries: 3, rateLimited: true };
    second.stats = { apiCalls: 1, failedCalls: 0, retries: 0, rateLimited: false };
    const adapter = new Adapter();
    adapter.setAuthToken('unused-fallback');
    const firstRun = adapter.crawl(request('first-token'));
    const secondResult = await adapter.crawl(request('second-token'));
    release();
    const firstResult = await firstRun;

    expect(mocks.createClient.mock.calls).toEqual([['first-token', undefined], ['second-token', undefined]]);
    expect(firstResult.metadata).toMatchObject({ api_calls: 4, failed_calls: 3, retries: 3, rate_limited: true });
    expect(secondResult.metadata).toMatchObject({ api_calls: 1, failed_calls: 0, retries: 0, rate_limited: false });
  });
});
