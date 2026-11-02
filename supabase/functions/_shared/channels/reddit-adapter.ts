import { TikHubClient } from '../tikhub-client.ts';
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
  private postId(item: any): string { const data = item?.post || item?.data || item; return this.typedId(data?.id || data?.name, 't3'); }
  private typedId(value: unknown, prefix: 't1' | 't3'): string {
    if (typeof value !== 'string') return '';
    if (new RegExp(`^${prefix}_[a-z0-9]+$`, 'i').test(value)) return value;
    return /^[a-z0-9]+$/i.test(value) ? `${prefix}_${value}` : '';
  }
  private text(value: any): string { return typeof value === 'string' ? value : typeof value?.markdown === 'string' ? value.markdown : ''; }
  private author(value: any): string { return typeof value === 'string' ? value : this.text(value?.name || value?.username || value?.displayName); }
  private count(value: unknown): number { const n = typeof value === 'number' || typeof value === 'string' ? Number(value) : 0; return Number.isFinite(n) ? n : 0; }
  private date(value: unknown): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const date = typeof value === 'number' || /^\d+(?:\.\d+)?$/.test(String(value))
      ? new Date(Number(value) * 1000) : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value) : undefined;
    return date && Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  }
  private async loadComments(client: TikHubClient, posts: UnifiedPost[], limit: number): Promise<UnifiedComment[]> { const result = new Map<string, UnifiedComment>(); for (const post of posts.slice(0, 5)) { const page: any = await client.getRedditComments(post.post_id, limit); for (const item of (Array.isArray(page) ? page : page.comments || []).slice(0, limit)) { const c = this.toComment(item, post.post_id); if (c.comment_id && !result.has(c.comment_id)) result.set(c.comment_id, c); } } return Array.from(result.values()); }
  private toPost(item: any): UnifiedPost {
    const data = item?.post || item?.data || item;
    const title = this.text(data?.postTitle ?? data?.title);
    return { post_id: this.postId(item), platform: this.channel, title,
      content: this.text(data?.content) || this.text(data?.selftext) || title,
      content_type: data?.is_video ? 'video' : 'text', author: this.author(data?.author),
      metrics: { likes: this.count(data?.score ?? data?.ups), comments: this.count(data?.comments ?? data?.num_comments), shares: 0, collects: 0 },
      created_at: this.date(data?.createdAt ?? data?.created_utc), raw_data: item };
  }
  private toComment(item: any, postId: string): UnifiedComment {
    const data = item?.comment || item?.data || item;
    return { comment_id: this.typedId(data?.id || data?.name, 't1'), platform: this.channel, post_id: postId,
      content: this.text(data?.content) || this.text(data?.body) || this.text(data?.text), author: this.author(data?.author),
      metrics: { likes: this.count(data?.score ?? data?.ups) }, created_at: this.date(data?.createdAt ?? data?.created_utc) };
  }
  private metadata(client: TikHubClient, startedAt: number) { return { crawl_time_ms: Date.now() - startedAt, api_calls: client.stats.apiCalls, failed_calls: client.stats.failedCalls, retries: client.stats.retries, rate_limited: client.stats.rateLimited }; }
  private success(posts: UnifiedPost[], comments: UnifiedComment[], client: TikHubClient, startedAt: number): ChannelCrawlResult { return { success: true, channel: this.channel, posts, comments, stats: this.calculateStats(posts), metadata: this.metadata(client, startedAt) }; }
  private failed(error: string, startedAt: number, client?: TikHubClient): ChannelCrawlResult { return { ...this.createEmptyResult(error), ...(client ? { metadata: this.metadata(client, startedAt) } : {}) }; }
}
