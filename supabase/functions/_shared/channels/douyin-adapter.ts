/** 抖音数据适配，V5 搜索和 HTTP 重试由共享客户端负责。 */
import { TikHubClient, TikHubError } from '../tikhub-client.ts';
import { BaseChannelAdapter } from './base-adapter.ts';
import type { ChannelType, CrawlRequest, ChannelCrawlResult, UnifiedPost, UnifiedComment } from './types.ts';

interface DouyinVideo {
  aweme_id?: string;
  desc?: string;
  author?: { nickname?: string };
  statistics?: {
    digg_count?: number | string;
    comment_count?: number | string;
    share_count?: number | string;
    collect_count?: number | string;
    play_count?: number | string;
  };
  create_time?: number;
}

interface DouyinComment {
  cid?: string;
  text?: string;
  digg_count?: number | string;
  user?: { nickname?: string };
  ip_label?: string;
  create_time?: number;
}

export class DouyinAdapter extends BaseChannelAdapter {
  readonly channel: ChannelType = 'douyin';
  readonly displayName = '抖音';
  private authToken: string | null = null;

  isConfigured(): boolean {
    return !!this.authToken;
  }

  setAuthToken(token: string): void {
    this.authToken = token;
  }

  async crawl(request: CrawlRequest): Promise<ChannelCrawlResult> {
    const startTime = Date.now();
    const token = request.config.auth_token || this.authToken;
    if (!token?.trim()) return this.createEmptyResult('TikHub token not configured for Douyin');

    const client = new TikHubClient(token);
    try {
      const mode = request.config.mode || 'quick';
      const maxPosts = request.config.max_posts ?? (mode === 'deep' ? 10 : 5);
      const maxComments = request.config.max_comments_per_post ?? (mode === 'deep' ? 5 : 4);
      const firstPage = await client.searchDouyin(request.keyword);
      const videos = new Map<string, DouyinVideo>();
      const addVideos = (items: DouyinVideo[]) => {
        for (const video of items) {
          const id = String(video.aweme_id || '');
          if (id && !videos.has(id)) videos.set(id, video);
        }
      };
      addVideos(firstPage.videos);

      // V5 返回下一页完整状态，不能只传旧接口的 cursor。
      let stopAfterSearchError = false;
      if (mode === 'deep' && firstPage.hasMore && videos.size > 0) {
        try {
          await this.sleep(800);
          const page2 = await client.searchDouyin(request.keyword, firstPage.pagination);
          addVideos(page2.videos);
        } catch (error) {
          if (!(error instanceof TikHubError)) throw error;
          stopAfterSearchError = true;
          console.warn('[Douyin Adapter] TikHub 第二页失败，停止后续请求并保留首批样本:', error.message);
        }
      }

      const comments = new Map<string, UnifiedComment>();
      for (const [postId] of stopAfterSearchError ? [] : Array.from(videos).slice(0, Math.max(0, maxPosts))) {
        if (maxComments <= 0) break;
        try {
          await this.sleep(800);
          const items: DouyinComment[] = await client.getDouyinComments(postId, maxComments);
          for (const comment of items.slice(0, maxComments)) {
            const id = String(comment.cid || '');
            if (!id || comments.has(id)) continue;
            comments.set(id, {
              comment_id: id,
              platform: this.channel,
              post_id: postId,
              content: comment.text || '',
              author: comment.user?.nickname || '',
              metrics: { likes: Number(comment.digg_count || 0) },
              location: comment.ip_label || '',
              created_at: this.toIsoDate(comment.create_time),
            });
          }
        } catch (error) {
          console.warn(`[Douyin Adapter] 视频 ${postId} 评论失败，保留其他样本:`, error);
          if (error instanceof TikHubError) break;
        }
      }

      const posts: UnifiedPost[] = Array.from(videos, ([id, video]) => ({
        post_id: id,
        platform: this.channel,
        title: (video.desc || '').slice(0, 50),
        content: video.desc || '',
        content_type: 'video',
        author: video.author?.nickname || '',
        metrics: {
          likes: Number(video.statistics?.digg_count || 0),
          comments: Number(video.statistics?.comment_count || 0),
          shares: Number(video.statistics?.share_count || 0),
          collects: Number(video.statistics?.collect_count || 0),
          views: Number(video.statistics?.play_count || 0),
        },
        created_at: this.toIsoDate(video.create_time),
        raw_data: video as unknown as Record<string, unknown>,
      }));
      return {
        success: true,
        channel: this.channel,
        posts,
        comments: Array.from(comments.values()),
        stats: this.calculateStats(posts),
        metadata: this.crawlMetadata(client, startTime),
      };
    } catch (error) {
      return {
        ...this.createEmptyResult(error instanceof Error ? error.message : 'Unknown error'),
        metadata: this.crawlMetadata(client, startTime),
      };
    }
  }

  private crawlMetadata(client: TikHubClient, startTime: number) {
    return {
      crawl_time_ms: Date.now() - startTime,
      api_calls: client.stats.apiCalls,
      failed_calls: client.stats.failedCalls,
      retries: client.stats.retries,
      rate_limited: client.stats.rateLimited,
    };
  }

  private toIsoDate(seconds?: number): string | undefined {
    if (!seconds) return undefined;
    const date = new Date(Number(seconds) * 1000);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  override mapContentTypeToDisplay(type: UnifiedPost['content_type']): string {
    switch (type) {
      case 'video': return '短视频';
      case 'image': return '图集';
      case 'text': return '文字';
      case 'mixed': return '混合内容';
      default: return '其他';
    }
  }
}
