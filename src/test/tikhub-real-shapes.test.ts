import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedditAdapter } from '../../supabase/functions/_shared/channels/reddit-adapter.ts';
import { YouTubeAdapter } from '../../supabase/functions/_shared/channels/youtube-adapter.ts';
import { TikTokAdapter } from '../../supabase/functions/_shared/channels/tiktok-adapter.ts';

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock('../../supabase/functions/_shared/tikhub-client.ts', () => ({
  TikHubClient: class { constructor() { return mocks.client(); } },
}));
const request = { keyword: 'workflow', config: { auth_token: 'mock-only', mode: 'deep' as const } };
const stats = { apiCalls: 2, failedCalls: 0, retries: 0, rateLimited: false };
beforeEach(() => mocks.client.mockReset());

describe('real cleaned adapter shapes', () => {
  it('maps Reddit post/comment wrappers without confusing user IDs and binds t3 parents', async () => {
    const client = {
      stats,
      searchReddit: vi.fn().mockResolvedValue({ items: [
        { post: { id: 't3_abc123', postTitle: 'Manual scheduling', content: { markdown: '**Too slow**' }, score: 0, comments: 12, author: { id: 't2_user', name: 'alice' } } },
        { data: { id: 'abc123', title: 'duplicate' } },
        { post: { id: 't2_user', postTitle: 'not a post' } },
      ], hasMore: false }),
      getRedditComments: vi.fn().mockResolvedValue([
        { comment: { id: 't1_def456', content: { markdown: 'Need automation' }, score: 0, author: { id: 't2_writer', name: 'bob' }, postId: 't3_wrong' } },
        { comment: { id: 't2_writer', content: { markdown: 'not a comment' } } },
      ]),
    };
    mocks.client.mockReturnValue(client);
    const result = await new RedditAdapter().crawl(request);
    expect(result.success).toBe(true);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]).toMatchObject({ post_id: 't3_abc123', title: 'Manual scheduling', content: '**Too slow**', author: 'alice', metrics: { likes: 0, comments: 12 } });
    expect(client.getRedditComments).toHaveBeenCalledWith('t3_abc123', 10);
    expect(result.comments).toEqual([expect.objectContaining({ comment_id: 't1_def456', post_id: 't3_abc123', content: 'Need automation', author: 'bob', metrics: { likes: 0 } })]);
  });

  it.each([['1.2K', 1200], ['1,234 views', 1234], [42, 42], ['unknown', 0]])('maps YouTube cleaned fields and count %s without inventing dates or interactions', async (view_count, views) => {
    mocks.client.mockReturnValue({ stats,
      searchYouTube: vi.fn().mockResolvedValue({ items: [{ video_id: 'dQw4w9WgXcQ', title: 'Workflow', description_snippet: 'Actual snippet', view_count, published_time: '2 days ago', author: 'Creator' }], hasMore: false }),
      getYouTubeComments: vi.fn().mockResolvedValue([]),
    });
    const result = await new YouTubeAdapter().crawl(request);
    expect(result.posts[0]).toMatchObject({ content: 'Actual snippet', author: 'Creator', metrics: { views, likes: 0, comments: 0 } });
    expect(result.posts[0].created_at).toBeUndefined();
  });

  it('normalizes bare Reddit IDs and keeps comment IDs separate from author IDs', async () => {
    const client = { stats,
      searchReddit: vi.fn().mockResolvedValue({ items: [{ id: 'abc123', postTitle: 'Post', content: { markdown: 'Body' }, createdAt: 'bad-date' }], hasMore: false }),
      getRedditComments: vi.fn().mockResolvedValue([{ comment: { id: 'def456', content: { markdown: 'Reply' }, author: { id: 't2_user' } } }]),
    };
    mocks.client.mockReturnValue(client);
    const result = await new RedditAdapter().crawl(request);
    expect(result.posts[0].post_id).toBe('t3_abc123');
    expect(result.posts[0].created_at).toBeUndefined();
    expect(client.getRedditComments).toHaveBeenCalledWith('t3_abc123', 10);
    expect(result.comments[0]).toMatchObject({ comment_id: 't1_def456', post_id: 't3_abc123', author: '' });
  });

  it('retains explicit YouTube timestamps and parses supplied statistics only', async () => {
    mocks.client.mockReturnValue({ stats,
      searchYouTube: vi.fn().mockResolvedValue({ items: [{ video_id: 'dQw4w9WgXcQ', title: 'Post', published_time: '2026-01-02T03:04:05Z', author: { name: 'Creator' }, statistics: { likeCount: '1.2K', commentCount: '34', viewCount: '2M' } }], hasMore: false }),
      getYouTubeComments: vi.fn().mockResolvedValue([]),
    });
    const result = await new YouTubeAdapter().crawl(request);
    expect(result.posts[0]).toMatchObject({ author: 'Creator', created_at: '2026-01-02T03:04:05.000Z', metrics: { likes: 1200, comments: 34, views: 2000000 } });
  });

  it('keeps TikTok flattened mapping finite for malformed counts and timestamps', async () => {
    mocks.client.mockReturnValue({ stats,
      searchTikTok: vi.fn().mockResolvedValue({ items: [{ aweme_id: '123', desc: 'Real post', create_time: 'invalid', statistics: { digg_count: 'invalid', play_count: '1200' } }], hasMore: false }),
      getTikTokComments: vi.fn().mockResolvedValue([{ cid: 'c1', text: 'Reply', digg_count: 'invalid' }]),
    });
    const result = await new TikTokAdapter().crawl(request);
    expect(result.posts[0]).toMatchObject({ post_id: '123', content: 'Real post', metrics: { likes: 0, views: 1200 } });
    expect(result.posts[0].created_at).toBeUndefined();
    expect(result.comments[0].metrics.likes).toBe(0);
  });
});
