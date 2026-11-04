import { TikHubClient } from '../tikhub-client.ts';
import { BaseChannelAdapter } from './base-adapter.ts';
import type { ChannelCrawlResult, ChannelType, CrawlRequest, UnifiedComment, UnifiedPost } from './types.ts';

const POST_LIMIT = 10;
const COMMENT_POST_LIMIT = 5;
const COMMENT_LIMIT = 10;

export class TikTokAdapter extends BaseChannelAdapter {
  readonly channel: ChannelType = 'tiktok';
  readonly displayName = 'TikTok';
  private authToken: string | null = null;

  isConfigured(): boolean { return Boolean(this.authToken?.trim()); }
  setAuthToken(token: string): void { this.authToken = token; }

  async crawl(request: CrawlRequest): Promise<ChannelCrawlResult> {
    const startedAt = Date.now();
    const token = request.config.auth_token || this.authToken || '';
    if (!token.trim()) return this.failed('TikHub token not configured', startedAt);
    const client = new TikHubClient(token);
    const warnings: string[] = [];
    try {
      const postsById = new Map<string, any>();
      let page = await client.searchTikTok(request.keyword, { count: 20, region: request.config.countryCode || 'US' });
      this.addPosts(postsById, page.items);
      const nextOffset = (page as any).offset ?? (page as any).nextOffset;
      if (page.hasMore && nextOffset !== undefined) {
        page = await this.readOptionalPage(() => client.searchTikTok(request.keyword, { offset: nextOffset, count: 20, region: request.config.countryCode || 'US' }), page, warnings);
        this.addPosts(postsById, page.items);
      }
      const posts = Array.from(postsById.values()).slice(0, this.postLimit(request)).map((item) => this.toPost(item));
      const comments = await this.loadComments(client, posts, this.commentLimit(request), warnings);
      return this.success(posts, comments, client, startedAt, warnings);
    } catch (error) {
      return this.failed(error instanceof Error ? error.message : 'TikTok crawl failed', startedAt, client);
    }
  }

  private postLimit(request: CrawlRequest): number { return Math.min(POST_LIMIT, Math.max(0, request.config.max_posts ?? POST_LIMIT)); }
  private commentLimit(request: CrawlRequest): number { return Math.min(COMMENT_LIMIT, Math.max(0, request.config.max_comments_per_post ?? COMMENT_LIMIT)); }
  private addPosts(target: Map<string, any>, items: any[]): void {
    for (const item of items || []) {
      const id = this.postId(item);
      if (id && !target.has(id)) target.set(id, item);
    }
  }
  private postId(item: any): string { return String(item?.aweme_id || item?.id || item?.video_id || ''); }
  private async loadComments(client: TikHubClient, posts: UnifiedPost[], limit: number, warnings: string[]): Promise<UnifiedComment[]> {
    const result = new Map<string, UnifiedComment>();
    if (limit <= 0) return [];
    for (const post of posts.slice(0, 5)) {
      try {
        const page = await client.getTikTokComments(post.post_id, limit);
        for (const item of page.slice(0, limit)) {
          const comment = this.toComment(item, post.post_id);
          if (comment.comment_id && !result.has(comment.comment_id)) result.set(comment.comment_id, comment);
        }
      } catch (error) {
        warnings.push('评论采集失败，已保留成功取得的帖子与评论');
        const failure = error as { status?: number; kind?: string };
        if ([401,402,403,422,429].includes(failure.status || 0) || failure.kind === 'budget') break;
      }
    }
    return Array.from(result.values());
  }
  private toPost(item: any): UnifiedPost {
    const stats = item?.statistics || item?.stats || {};
    const content = String(item?.desc || item?.description || item?.title || '');
    return { post_id: this.postId(item), platform: this.channel, title: content.slice(0, 80), content, content_type: 'video', author: String(item?.author?.nickname || item?.author?.unique_id || item?.author?.username || ''), metrics: { likes: this.count(stats.digg_count ?? stats.like_count ?? item?.like_count), comments: this.count(stats.comment_count ?? item?.comment_count), shares: this.count(stats.share_count ?? item?.share_count), collects: this.count(stats.collect_count ?? item?.collect_count), views: this.count(stats.play_count ?? item?.view_count) }, created_at: this.toIsoDate(item?.create_time), raw_data: item };
  }
  private count(value: unknown): number { const n = typeof value === 'string' || typeof value === 'number' ? Number(value) : 0; return Number.isFinite(n) && n >= 0 ? n : 0; }
  private toComment(item: any, postId: string): UnifiedComment { return { comment_id: String(item?.cid || item?.comment_id || item?.id || ''), platform: this.channel, post_id: postId, content: String(item?.text || item?.content || ''), author: String(item?.user?.nickname || item?.author?.nickname || item?.author?.username || ''), metrics: { likes: this.count(item?.digg_count ?? item?.like_count) }, created_at: this.toIsoDate(item?.create_time), location: String(item?.ip_label || '') }; }
  private toIsoDate(value: unknown): string | undefined { if (!value) return undefined; const date = new Date(Number(value) * 1000); return Number.isNaN(date.getTime()) ? undefined : date.toISOString(); }
  private metadata(client: TikHubClient, startedAt: number) { return { crawl_time_ms: Date.now() - startedAt, api_calls: client.stats.apiCalls, failed_calls: client.stats.failedCalls, retries: client.stats.retries, rate_limited: client.stats.rateLimited }; }
  private success(posts: UnifiedPost[], comments: UnifiedComment[], client: TikHubClient, startedAt: number, warnings: string[] = []): ChannelCrawlResult { return { success: true, channel: this.channel, posts, comments, stats: this.calculateStats(posts), metadata: { ...this.metadata(client, startedAt), partial: warnings.length > 0, warnings } }; }
  private failed(error: string, startedAt: number, client?: TikHubClient): ChannelCrawlResult { return { ...this.createEmptyResult(error), ...(client ? { metadata: this.metadata(client, startedAt) } : {}) }; }
}
