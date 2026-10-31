import { TikHubClient } from '../../_shared/tikhub-client.ts';
import { BaseChannelAdapter } from './base-adapter.ts';
import type { ChannelCrawlResult, ChannelType, CrawlRequest, UnifiedComment, UnifiedPost } from './types.ts';

export class RedditAdapter extends BaseChannelAdapter {
  readonly channel: ChannelType = 'reddit';
  readonly displayName = 'Reddit';
  private authToken: string | null = null;
  isConfigured(): boolean { return Boolean(this.authToken?.trim()); }
  setAuthToken(token: string): void { this.authToken = token; }
  async crawl(request: CrawlRequest): Promise<ChannelCrawlResult> {
    const startedAt = Date.now(); const token = request.config.auth_token || this.authToken || '';
    if (!token.trim()) return this.failed('TikHub token not configured', startedAt);
    const client = new TikHubClient(token);
    try {
      const postsById = new Map<string, any>(); let page = await client.searchReddit(request.keyword); this.addPosts(postsById, page.items);
      const nextAfter = (page as any).after || (page as any).nextAfter;
      if (page.hasMore && nextAfter) { page = await client.searchReddit(request.keyword, { after: nextAfter }); this.addPosts(postsById, page.items); }
      const posts = Array.from(postsById.values()).slice(0, Math.min(10, request.config.max_posts ?? 10)).map((item) => this.toPost(item));
      const comments = await this.loadComments(client, posts, Math.min(10, request.config.max_comments_per_post ?? 10));
      return this.success(posts, comments, client, startedAt);
    } catch (error) { return this.failed(error instanceof Error ? error.message : 'Reddit crawl failed', startedAt, client); }
  }
  private addPosts(target: Map<string, any>, items: any[]): void { for (const item of items || []) { const id = this.postId(item); if (id && !target.has(id)) target.set(id, item); } }
  private postId(item: any): string { const data = item?.data || item; return String(data?.id || data?.name || item?.id || ''); }
  private async loadComments(client: TikHubClient, posts: UnifiedPost[], limit: number): Promise<UnifiedComment[]> { const result = new Map<string, UnifiedComment>(); for (const post of posts.slice(0, 5)) { const page: any = await client.getRedditComments(post.post_id, limit); for (const item of (Array.isArray(page) ? page : page.comments || []).slice(0, limit)) { const c = this.toComment(item, post.post_id); if (c.comment_id && !result.has(c.comment_id)) result.set(c.comment_id, c); } } return Array.from(result.values()); }
  private toPost(item: any): UnifiedPost { const data = item?.data || item; return { post_id: this.postId(item), platform: this.channel, title: String(data?.title || ''), content: String(data?.selftext || data?.title || ''), content_type: data?.is_video ? 'video' : 'text', author: String(data?.author || ''), metrics: { likes: Number(data?.ups || data?.score || 0), comments: Number(data?.num_comments || 0), shares: 0, collects: 0 }, created_at: data?.created_utc ? new Date(Number(data.created_utc) * 1000).toISOString() : undefined, raw_data: item }; }
  private toComment(item: any, postId: string): UnifiedComment { const data = item?.data || item; return { comment_id: String(data?.id || data?.name || ''), platform: this.channel, post_id: postId, content: String(data?.body || data?.text || ''), author: String(data?.author || ''), metrics: { likes: Number(data?.ups || data?.score || 0) } }; }
  private metadata(client: TikHubClient, startedAt: number) { return { crawl_time_ms: Date.now() - startedAt, api_calls: client.stats.apiCalls, failed_calls: client.stats.failedCalls, retries: client.stats.retries, rate_limited: client.stats.rateLimited }; }
  private success(posts: UnifiedPost[], comments: UnifiedComment[], client: TikHubClient, startedAt: number): ChannelCrawlResult { return { success: true, channel: this.channel, posts, comments, stats: this.calculateStats(posts), metadata: this.metadata(client, startedAt) }; }
  private failed(error: string, startedAt: number, client?: TikHubClient): ChannelCrawlResult { return { ...this.createEmptyResult(error), ...(client ? { metadata: this.metadata(client, startedAt) } : {}) }; }
}
