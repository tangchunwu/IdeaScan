import { afterEach, describe, expect, it, vi } from 'vitest';
import { TikHubClient } from '../../supabase/functions/_shared/tikhub-client';
import { collectQuery } from '../../scripts/collect-tikhub-overseas.mjs';

const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status });
afterEach(() => vi.unstubAllGlobals());

describe('海外研究采集复用产品客户端', () => {
  it('TikTok 不会选中空 aweme_list，保留完整正文、互动和父帖链接', async () => {
    const content = '사주 원문 '.repeat(100);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ code: 200, data: { aweme_list: [], search_item_list: [{ aweme_info: {
        aweme_id: '1234567890123456789', desc: content, author: { unique_id: 'korean_user' }, statistics: { digg_count: 12, comment_count: 3 },
        logging_info_token: '不得进入报告',
      } }], cursor: 5, has_more: 1 } }))
      .mockResolvedValueOnce(json({ code: 200, data: { comments: [{ cid: 'c1', text: '얼마예요?', digg_count: 2 }] } }));
    vi.stubGlobal('fetch', fetcher);
    const result = await collectQuery({ platform: 'tiktok', query: '사주', region: 'KR' }, new TikHubClient('test-only'));
    expect(result.search).toMatchObject({ status: 'success', savedCount: 1 });
    expect(result.posts[0]).toMatchObject({ content, url: 'https://www.tiktok.com/@korean_user/video/1234567890123456789', metrics: { likes: 12, comments: 3 } });
    expect(result.comments[0]).toMatchObject({ postId: '1234567890123456789', content: '얼마예요?', parentUrl: result.posts[0].url });
    expect(new URL(fetcher.mock.calls[0][0]).searchParams.get('region')).toBe('KR');
    expect(JSON.stringify(result)).not.toContain('不得进入报告');
    expect(fetcher).toHaveBeenCalledTimes(2); // 研究采样不自动翻页
  });

  it('Threads 按 query 合同搜索并解开 node.thread.thread_items，评论使用数字 pk', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ code: 200, data: { results: [{ node: { thread: { thread_items: [{ post: {
        pk: '3390920896561588969', id: 'composite-id', code: 'AbcDEf12', user: { username: 'coffee_friend' }, caption: { text: 'kahve falı' }, like_count: 4,
      } }] } } }], cursor: 'more' } }))
      .mockResolvedValueOnce(json({ code: 200, data: { edges: [{ node: { thread_items: [{ post: { pk: 'comment-pk', caption: { text: 'teşekkürler' } } }] } }], page_info: { has_next_page: true } } }));
    vi.stubGlobal('fetch', fetcher);
    const result = await collectQuery({ platform: 'threads', query: 'kahve falı' }, new TikHubClient('test-only'));
    const search = new URL(fetcher.mock.calls[0][0]);
    expect(search.searchParams.get('query')).toBe('kahve falı');
    expect(search.searchParams.has('keyword')).toBe(false);
    expect(new URL(fetcher.mock.calls[1][0]).searchParams.get('post_id')).toBe('3390920896561588969');
    expect(result.posts[0].url).toBe('https://www.threads.com/@coffee_friend/post/AbcDEf12');
    expect(result.comments[0].content).toBe('teşekkürler');
  });

  it('真实空搜索不会触发评论请求，也不会伪报取得帖子', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ code: 200, data: { aweme_list: [{ aweme_id: 'irrelevant' }], search_item_list: [] } }));
    vi.stubGlobal('fetch', fetcher);
    const result = await collectQuery({ platform: 'tiktok', query: 'empty' }, new TikHubClient('test-only'));
    expect(result.search.status).toBe('empty');
    expect(result.posts).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('422 不重试、不泄露响应中的密钥、不当作空成功', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ detail: 'private response', token: 'test-only' }, 422));
    vi.stubGlobal('fetch', fetcher);
    const result = await collectQuery({ platform: 'threads', query: 'bad' }, new TikHubClient('test-only'));
    expect(result.search).toMatchObject({ status: 'failed', httpStatus: 422 });
    expect(JSON.stringify(result)).not.toMatch(/private response|test-only/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
