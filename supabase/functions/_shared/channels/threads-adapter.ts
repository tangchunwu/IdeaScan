import { TikHubClient } from '../tikhub-client.ts';
import { BaseChannelAdapter } from './base-adapter.ts';
import type { ChannelCrawlResult, ChannelType, CrawlRequest, UnifiedComment, UnifiedPost } from './types.ts';

export class ThreadsAdapter extends BaseChannelAdapter {
  readonly channel: ChannelType = 'threads';
  readonly displayName = 'Threads';
  private authToken: string | null = null;
  isConfigured(): boolean { return Boolean(this.authToken?.trim()); }
  setAuthToken(token: string): void { this.authToken = token; }

  async crawl(request: CrawlRequest): Promise<ChannelCrawlResult> {
    const startedAt = Date.now(); const token = request.config.auth_token || this.authToken || '';
    if (!token.trim()) return this.failed('TikHub token not configured', startedAt);
    const client = new TikHubClient(token);
    try {
      const page = await client.searchThreads(request.keyword);
      const posts = page.items.slice(0, Math.min(10, request.config.max_posts ?? 10)).map(item => this.toPost(item));
      const comments = await this.loadComments(client, posts, Math.min(10, request.config.max_comments_per_post ?? 10));
      return this.success(posts, comments, client, startedAt);
    } catch (error) { return this.failed(error instanceof Error ? error.message : 'Threads crawl failed', startedAt, client); }
  }

  private async loadComments(client: TikHubClient, posts: UnifiedPost[], limit: number): Promise<UnifiedComment[]> {
    const result = new Map<string, UnifiedComment>();
    for (const post of posts.slice(0, 5)) {
      const page: any = await client.getThreadsComments(post.post_id, limit);
      for (const item of (Array.isArray(page) ? page : page.comments || []).slice(0, limit)) {
        const comment = this.toComment(item, post.post_id);
        if (comment.comment_id && !result.has(comment.comment_id)) result.set(comment.comment_id, comment);
      }
    }
    return Array.from(result.values());
  }
  private postId(item: any): string { return String(item?.code || item?.pk || item?.id || ''); }
  private toPost(item: any): UnifiedPost { const user = item?.user || {}; return { post_id: this.postId(item), platform: this.channel, title: String(item?.caption?.text || item?.text || '').slice(0, 80), content: String(item?.caption?.text || item?.text || ''), content_type: item?.video_versions?.length ? 'video' : item?.image_versions2 ? 'image' : 'text', author: String(user?.username || user?.full_name || ''), metrics: { likes: Number(item?.like_count || 0), comments: Number(item?.direct_reply_count || item?.reply_count || 0), shares: Number(item?.repost_count || 0), collects: 0, views: 0 }, created_at: item?.taken_at ? new Date(Number(item.taken_at) * 1000).toISOString() : undefined, raw_data: item }; }
  private toComment(item: any, postId: string): UnifiedComment { const user = item?.user || {}; return { comment_id: String(item?.pk || item?.id || ''), platform: this.channel, post_id: postId, content: String(item?.text || item?.caption?.text || ''), author: String(user?.username || user?.full_name || ''), metrics: { likes: Number(item?.like_count || 0) } }; }
  private metadata(client: TikHubClient, startedAt: number) { return { crawl_time_ms: Date.now() - startedAt, api_calls: client.stats.apiCalls, failed_calls: client.stats.failedCalls, retries: client.stats.retries, rate_limited: client.stats.rateLimited }; }
  private success(posts: UnifiedPost[], comments: UnifiedComment[], client: TikHubClient, startedAt: number): ChannelCrawlResult { return { success: true, channel: this.channel, posts, comments, stats: this.calculateStats(posts), metadata: this.metadata(client, startedAt) }; }
  private failed(error: string, startedAt: number, client?: TikHubClient): ChannelCrawlResult { return { ...this.createEmptyResult(error), ...(client ? { metadata: this.metadata(client, startedAt) } : {}) }; }
}
