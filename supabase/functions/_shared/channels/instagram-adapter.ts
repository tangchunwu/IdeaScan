import { TikHubClient } from '../tikhub-client.ts';
import { BaseChannelAdapter } from './base-adapter.ts';
import type { ChannelCrawlResult, ChannelType, CrawlRequest, UnifiedComment, UnifiedPost } from './types.ts';

export class InstagramAdapter extends BaseChannelAdapter {
  readonly channel: ChannelType = 'instagram';
  readonly displayName = 'Instagram';
  private authToken: string | null = null;
  isConfigured(): boolean { return Boolean(this.authToken?.trim()); }
  setAuthToken(token: string): void { this.authToken = token; }

  async crawl(request: CrawlRequest): Promise<ChannelCrawlResult> {
    const startedAt = Date.now();
    const token = request.config.auth_token || this.authToken || '';
    if (!token.trim()) return this.failed('TikHub token not configured', startedAt);
    const client = new TikHubClient(token);
    try {
      const postsById = new Map<string, any>();
      let page = await client.searchInstagram(request.keyword, { mode: 'general' });
      this.addPosts(postsById, page.items);
      const nextToken = (page as any).continuationToken || (page as any).nextToken;
      if (page.hasMore && nextToken) {
        page = await client.searchInstagram(request.keyword, { mode: 'general', paginationToken: nextToken });
        this.addPosts(postsById, page.items);
      }
      const posts = Array.from(postsById.values()).slice(0, Math.min(10, request.config.max_posts ?? 10)).map((item) => this.toPost(item));
      const comments = await this.loadComments(client, posts, Math.min(10, request.config.max_comments_per_post ?? 10));
      return this.success(posts, comments, client, startedAt);
    } catch (error) { return this.failed(error instanceof Error ? error.message : 'Instagram crawl failed', startedAt, client); }
  }

  private addPosts(target: Map<string, any>, items: any[]): void { for (const item of items || []) { const id = this.postId(item); if (id && !target.has(id)) target.set(id, item); } }
  private postId(item: any): string { return String(item?.code || item?.shortcode || item?.id || item?.pk || item?.media?.id || ''); }
  private async loadComments(client: TikHubClient, posts: UnifiedPost[], limit: number): Promise<UnifiedComment[]> {
    const result = new Map<string, UnifiedComment>();
    for (const post of posts.slice(0, 5)) { const page: any = await client.getInstagramComments(post.post_id, limit); for (const item of (Array.isArray(page) ? page : page.comments || []).slice(0, limit)) { const c = this.toComment(item, post.post_id); if (c.comment_id && !result.has(c.comment_id)) result.set(c.comment_id, c); } }
    return Array.from(result.values());
  }
  private toPost(item: any): UnifiedPost { const media = item?.media || item; return { post_id: this.postId(item), platform: this.channel, title: String(media?.caption?.text || media?.title || '').slice(0, 80), content: String(media?.caption?.text || media?.title || ''), content_type: media?.media_type === 2 || media?.is_video ? 'video' : 'image', author: String(media?.user?.username || media?.user?.full_name || item?.user?.username || ''), metrics: { likes: Number(media?.like_count || media?.likes || 0), comments: Number(media?.comment_count || media?.comments || 0), shares: Number(media?.share_count || 0), collects: 0, views: Number(media?.view_count || 0) }, created_at: media?.taken_at ? new Date(Number(media.taken_at) * 1000).toISOString() : undefined, raw_data: item }; }
  private toComment(item: any, postId: string): UnifiedComment { return { comment_id: String(item?.pk || item?.id || item?.comment_id || ''), platform: this.channel, post_id: postId, content: String(item?.text || item?.content || ''), author: String(item?.user?.username || item?.user?.full_name || ''), metrics: { likes: Number(item?.like_count || item?.likes || 0) } }; }
  private metadata(client: TikHubClient, startedAt: number) { return { crawl_time_ms: Date.now() - startedAt, api_calls: client.stats.apiCalls, failed_calls: client.stats.failedCalls, retries: client.stats.retries, rate_limited: client.stats.rateLimited }; }
  private success(posts: UnifiedPost[], comments: UnifiedComment[], client: TikHubClient, startedAt: number): ChannelCrawlResult { return { success: true, channel: this.channel, posts, comments, stats: this.calculateStats(posts), metadata: this.metadata(client, startedAt) }; }
  private failed(error: string, startedAt: number, client?: TikHubClient): ChannelCrawlResult { return { ...this.createEmptyResult(error), ...(client ? { metadata: this.metadata(client, startedAt) } : {}) }; }
}
