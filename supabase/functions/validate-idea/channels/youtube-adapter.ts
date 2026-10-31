import { TikHubClient } from '../../_shared/tikhub-client.ts';
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
  private toPost(item: any): UnifiedPost { const stats = item?.statistics || item?.stats || {}; return { post_id: this.postId(item), platform: this.channel, title: String(item?.title || item?.video?.title || ''), content: String(item?.description || item?.video?.description || item?.title || ''), content_type: 'video', author: String(item?.channelTitle || item?.channel?.title || item?.author?.name || ''), metrics: { likes: Number(stats.likeCount || stats.likes || 0), comments: Number(stats.commentCount || stats.comments || 0), shares: 0, collects: 0, views: Number(stats.viewCount || stats.views || 0) }, created_at: item?.publishedAt || item?.publish_time || undefined, raw_data: item }; }
  private toComment(item: any, postId: string): UnifiedComment { return { comment_id: String(item?.commentId || item?.id || ''), platform: this.channel, post_id: postId, content: String(item?.text || item?.content || item?.commentText || ''), author: String(item?.authorDisplayName || item?.author?.name || item?.author?.title || ''), metrics: { likes: Number(item?.likeCount || item?.likes || 0) } }; }
  private metadata(client: TikHubClient, startedAt: number) { return { crawl_time_ms: Date.now() - startedAt, api_calls: client.stats.apiCalls, failed_calls: client.stats.failedCalls, retries: client.stats.retries, rate_limited: client.stats.rateLimited }; }
  private success(posts: UnifiedPost[], comments: UnifiedComment[], client: TikHubClient, startedAt: number): ChannelCrawlResult { return { success: true, channel: this.channel, posts, comments, stats: this.calculateStats(posts), metadata: this.metadata(client, startedAt) }; }
  private failed(error: string, startedAt: number, client?: TikHubClient): ChannelCrawlResult { return { ...this.createEmptyResult(error), ...(client ? { metadata: this.metadata(client, startedAt) } : {}) }; }
}
