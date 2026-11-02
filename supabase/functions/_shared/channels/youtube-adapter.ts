import { TikHubClient } from '../tikhub-client.ts';
import { BaseChannelAdapter } from './base-adapter.ts';
import type { ChannelCrawlResult, ChannelType, CrawlRequest, UnifiedComment, UnifiedPost } from './types.ts';

export class YouTubeAdapter extends BaseChannelAdapter {
  readonly channel: ChannelType = 'youtube';
  readonly displayName = 'YouTube';
  private authToken: string | null = null;
  isConfigured(): boolean { return Boolean(this.authToken?.trim()); }
  setAuthToken(token: string): void { this.authToken = token; }
  async crawl(request: CrawlRequest): Promise<ChannelCrawlResult> {
    const startedAt = Date.now(); const token = request.config.auth_token || this.authToken || '';
    if (!token.trim()) return this.failed('TikHub token not configured', startedAt);
    const client = new TikHubClient(token);
    try {
      const postsById = new Map<string, any>(); let page = await client.searchYouTube(request.keyword); this.addPosts(postsById, page.items);
      const nextToken = (page as any).continuationToken || (page as any).nextToken;
      if (page.hasMore && nextToken) { page = await client.searchYouTube(request.keyword, { continuationToken: nextToken }); this.addPosts(postsById, page.items); }
      const posts = Array.from(postsById.values()).slice(0, Math.min(10, request.config.max_posts ?? 10)).map((item) => this.toPost(item));
      const comments = await this.loadComments(client, posts, Math.min(10, request.config.max_comments_per_post ?? 10));
      return this.success(posts, comments, client, startedAt);
    } catch (error) { return this.failed(error instanceof Error ? error.message : 'YouTube crawl failed', startedAt, client); }
  }
  private addPosts(target: Map<string, any>, items: any[]): void { for (const item of items || []) { const id = this.postId(item); if (id && !target.has(id)) target.set(id, item); } }
  private postId(item: any): string { return String(item?.videoId || item?.video_id || item?.id || item?.video?.videoId || ''); }
  private async loadComments(client: TikHubClient, posts: UnifiedPost[], limit: number): Promise<UnifiedComment[]> { const result = new Map<string, UnifiedComment>(); for (const post of posts.slice(0, 5)) { const page: any = await client.getYouTubeComments(post.post_id, limit); for (const item of (Array.isArray(page) ? page : page.comments || []).slice(0, limit)) { const c = this.toComment(item, post.post_id); if (c.comment_id && !result.has(c.comment_id)) result.set(c.comment_id, c); } } return Array.from(result.values()); }
  private count(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : 0;
    if (typeof value !== 'string') return 0;
    const match = value.trim().replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*([KMB])?(?:\s+views?)?$/i);
    if (!match) return 0;
    const count = Number(match[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[match[2]?.toLowerCase()] ?? 1);
    return Number.isFinite(count) ? count : 0;
  }
  private date(value: unknown): string | undefined {
    // 相对日期没有可靠采集基准，不能据此生成事实时间。
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$)/.test(value)) return undefined;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  }
  private toPost(item: any): UnifiedPost {
    const stats = item?.statistics || item?.stats || {};
    return { post_id: this.postId(item), platform: this.channel, title: String(item?.title || item?.video?.title || ''),
      content: String(item?.description_snippet || item?.description || item?.video?.description || item?.title || ''), content_type: 'video',
      author: String(item?.channelTitle || item?.channel?.title || (typeof item?.author === 'string' ? item.author : item?.author?.name) || ''),
      metrics: { likes: this.count(stats.likeCount ?? stats.likes), comments: this.count(stats.commentCount ?? stats.comments), shares: 0, collects: 0,
        views: this.count(item?.view_count ?? stats.viewCount ?? stats.views) },
      created_at: this.date(item?.published_time ?? item?.publishedAt ?? item?.publish_time), raw_data: item };
  }
  private toComment(item: any, postId: string): UnifiedComment { return { comment_id: String(item?.commentId || item?.id || ''), platform: this.channel, post_id: postId, content: String(item?.text || item?.content || item?.commentText || ''), author: String(item?.authorDisplayName || item?.author?.name || item?.author?.title || ''), metrics: { likes: Number(item?.likeCount || item?.likes || 0) } }; }
  private metadata(client: TikHubClient, startedAt: number) { return { crawl_time_ms: Date.now() - startedAt, api_calls: client.stats.apiCalls, failed_calls: client.stats.failedCalls, retries: client.stats.retries, rate_limited: client.stats.rateLimited }; }
  private success(posts: UnifiedPost[], comments: UnifiedComment[], client: TikHubClient, startedAt: number): ChannelCrawlResult { return { success: true, channel: this.channel, posts, comments, stats: this.calculateStats(posts), metadata: this.metadata(client, startedAt) }; }
  private failed(error: string, startedAt: number, client?: TikHubClient): ChannelCrawlResult { return { ...this.createEmptyResult(error), ...(client ? { metadata: this.metadata(client, startedAt) } : {}) }; }
}
