/** 小红书数据适配，HTTP、重试和评论分页由共享客户端负责。 */
import { TikHubClient, TikHubError } from '../tikhub-client.ts';
import { BaseChannelAdapter } from './base-adapter.ts';
import type { ChannelType, CrawlRequest, ChannelCrawlResult, UnifiedPost, UnifiedComment } from './types.ts';

interface XhsNote {
  id?: string;
  note_id?: string;
  title?: string;
  desc?: string;
  type?: string;
  liked_count?: number | string;
  collected_count?: number | string;
  comments_count?: number | string;
  shared_count?: number | string;
  user?: { nickname?: string };
}

interface XhsComment {
  id?: string;
  content?: string;
  like_count?: number | string;
  user?: { nickname?: string };
  ip_location?: string;
}

export class XiaohongshuAdapter extends BaseChannelAdapter {
  readonly channel: ChannelType = 'xiaohongshu';
  readonly displayName = '小红书';
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
    if (!token?.trim()) return this.createEmptyResult('TikHub token not configured');

    // 注册表会复用适配器，但密钥和统计只属于本次请求。
    const client = new TikHubClient(token);
    try {
      const mode = request.config.mode || 'quick';
      const maxPosts = request.config.max_posts ?? (mode === 'deep' ? 10 : 5);
      const maxComments = request.config.max_comments_per_post ?? (mode === 'deep' ? 5 : 4);
      const firstPage = await client.searchXhs(request.keyword);
      const notes = new Map<string, XhsNote>();
      const addNotes = (items: XhsNote[]) => {
        for (const note of items) {
          const id = String(note.id || note.note_id || '');
          if (id && !notes.has(id)) notes.set(id, note);
        }
      };
      addNotes(firstPage.notes);

      // 保留最多两页的搜索预算，翻页必须携带同一搜索会话。
      let stopAfterSearchError = false;
      if (firstPage.hasMore && notes.size > 0) {
        try {
          await this.sleep(800);
          const page2 = await client.searchXhs(request.keyword, {
            page: 2,
            searchId: firstPage.searchId,
            searchSessionId: firstPage.searchSessionId,
          });
          addNotes(page2.notes);
        } catch (error) {
          if (!(error instanceof TikHubError)) throw error;
          stopAfterSearchError = true;
          console.warn('[XHS Adapter] TikHub 第二页失败，停止后续请求并保留首批样本:', error.message);
        }
      }

      const comments = new Map<string, UnifiedComment>();
      for (const [postId] of stopAfterSearchError ? [] : Array.from(notes).slice(0, Math.max(0, maxPosts))) {
        if (maxComments <= 0) break;
        try {
          await this.sleep(800);
          const items: XhsComment[] = await client.getXhsComments(postId, maxComments);
          for (const comment of items.slice(0, maxComments)) {
            const id = String(comment.id || '');
            if (!id || comments.has(id)) continue;
            // 在请求笔记评论时绑定父 ID，不再将所有评论指向第一条笔记。
            comments.set(id, {
              comment_id: id,
              platform: this.channel,
              post_id: postId,
              content: comment.content || '',
              author: comment.user?.nickname || '',
              metrics: { likes: Number(comment.like_count || 0) },
              location: comment.ip_location || '',
            });
          }
        } catch (error) {
          console.warn(`[XHS Adapter] 笔记 ${postId} 评论失败，保留其他样本:`, error);
          if (error instanceof TikHubError) break;
        }
      }

      const posts: UnifiedPost[] = Array.from(notes, ([id, note]) => ({
        post_id: id,
        platform: this.channel,
        title: note.title || '',
        content: note.desc || '',
        content_type: note.type === 'video' ? 'video' : 'image',
        author: note.user?.nickname || '',
        metrics: {
          likes: Number(note.liked_count || 0),
          comments: Number(note.comments_count || 0),
          shares: Number(note.shared_count || 0),
          collects: Number(note.collected_count || 0),
        },
        raw_data: note as unknown as Record<string, unknown>,
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
}
