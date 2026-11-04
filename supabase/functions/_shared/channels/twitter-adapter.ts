import { TikHubClient } from '../tikhub-client.ts';
import { BaseChannelAdapter } from './base-adapter.ts';
import type { ChannelCrawlResult, ChannelType, CrawlRequest, UnifiedComment, UnifiedPost } from './types.ts';

export class TwitterAdapter extends BaseChannelAdapter {
  readonly channel: ChannelType = 'twitter';
  readonly displayName = 'X / Twitter';
  private authToken: string | null = null;
  isConfigured(): boolean { return Boolean(this.authToken?.trim()); }
  setAuthToken(token: string): void { this.authToken = token; }

  async crawl(request: CrawlRequest): Promise<ChannelCrawlResult> {
    const startedAt = Date.now(); const token = request.config.auth_token || this.authToken || '';
    if (!token.trim()) return this.failed('TikHub token not configured', startedAt);
    const client = new TikHubClient(token);
    try {
      const page = await client.searchTwitter(request.keyword, { searchType: 'Top' });
      const posts = page.items.slice(0, Math.min(10, request.config.max_posts ?? 10)).map(item => this.toPost(item));
      const comments = await this.loadComments(client, posts, Math.min(10, request.config.max_comments_per_post ?? 10));
      return this.success(posts, comments, client, startedAt);
    } catch (error) { return this.failed(error instanceof Error ? error.message : 'Twitter crawl failed', startedAt, client); }
  }

  private async loadComments(client: TikHubClient, posts: UnifiedPost[], limit: number): Promise<UnifiedComment[]> {
    const result = new Map<string, UnifiedComment>();
    for (const post of posts.slice(0, 5)) {
      const page: any = await client.getTwitterComments(post.post_id, limit);
      for (const item of (Array.isArray(page) ? page : page.comments || []).slice(0, limit)) {
        const comment = this.toComment(item, post.post_id);
        if (comment.comment_id && !result.has(comment.comment_id)) result.set(comment.comment_id, comment);
      }
    }
    return Array.from(result.values());
  }
  private postId(item: any): string { return String(item?.tweet_id || item?.id || ''); }
  private toPost(item: any): UnifiedPost {
    return { post_id: this.postId(item), platform: this.channel, title: String(item?.text || '').slice(0, 80), content: String(item?.text || ''), content_type: item?.media?.video?.length ? 'video' : 'text', author: String(item?.user_info?.name || item?.screen_name || ''), metrics: { likes: Number(item?.favorites || 0), comments: Number(item?.replies || 0), shares: Number(item?.retweets || 0), collects: Number(item?.bookmarks || 0), views: Number(item?.views || 0) }, created_at: item?.created_at ? new Date(item.created_at).toISOString() : undefined, raw_data: item };
  }
  private toComment(item: any, postId: string): UnifiedComment { return { comment_id: String(item?.id || item?.comment_id || ''), platform: this.channel, post_id: postId, content: String(item?.text || item?.content || ''), author: String(item?.user_info?.name || item?.screen_name || ''), metrics: { likes: Number(item?.likes || item?.favorite_count || 0) } }; }
  private metadata(client: TikHubClient, startedAt: number) { return { crawl_time_ms: Date.now() - startedAt, api_calls: client.stats.apiCalls, failed_calls: client.stats.failedCalls, retries: client.stats.retries, rate_limited: client.stats.rateLimited }; }
  private success(posts: UnifiedPost[], comments: UnifiedComment[], client: TikHubClient, startedAt: number): ChannelCrawlResult { return { success: true, channel: this.channel, posts, comments, stats: this.calculateStats(posts), metadata: this.metadata(client, startedAt) }; }
  private failed(error: string, startedAt: number, client?: TikHubClient): ChannelCrawlResult { return { ...this.createEmptyResult(error), ...(client ? { metadata: this.metadata(client, startedAt) } : {}) }; }
}
