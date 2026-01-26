/**
 * Douyin (抖音) Channel Adapter
 * 
 * Implements the ChannelAdapter interface for crawling Douyin data
 * via the Tikhub API.
 * 
 * API Endpoints Used:
 * - /api/v1/douyin/web/fetch_video_search_result - Search videos by keyword
 * - /api/v1/douyin/web/fetch_video_comments - Get video comments
 */

import { BaseChannelAdapter } from './base-adapter.ts';
import type {
  ChannelType,
  CrawlRequest,
  ChannelCrawlResult,
  UnifiedPost,
  UnifiedComment,
} from './types.ts';

// ============ Tikhub Douyin API Types ============

interface DouyinVideo {
  aweme_id: string;
  desc: string;
  author: {
    nickname: string;
    uid: string;
    sec_uid: string;
  };
  statistics: {
    digg_count: number;      // likes
    comment_count: number;   // comments
    share_count: number;     // shares
    collect_count: number;   // favorites
    play_count?: number;     // views
  };
  create_time?: number;
  video?: {
    duration?: number;
  };
}

interface DouyinComment {
  cid: string;
  text: string;
  digg_count: number;
  user: {
    nickname: string;
    uid: string;
  };
  ip_label?: string;
  create_time?: number;
}

interface TikhubDouyinSearchResult {
  success: boolean;
  videos: DouyinVideo[];
  total_count: number;
  has_more: boolean;
  cursor?: number;
}

interface TikhubDouyinCommentsResult {
  success: boolean;
  comments: DouyinComment[];
  total_count: number;
  has_more: boolean;
  cursor?: number;
}

const TIKHUB_BASE_URL = 'https://api.tikhub.io';

// ============ Douyin Adapter ============

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
    let apiCalls = 0;
    let rateLimited = false;
    
    // Use provided token or instance token
    const token = request.config.auth_token || this.authToken;
    
    if (!token) {
      console.log('[Douyin Adapter] No auth token configured');
      return this.createEmptyResult('Tikhub token not configured for Douyin');
    }
    
    try {
      const mode = request.config.mode || 'quick';
      console.log(`[Douyin Adapter] Crawling for: "${request.keyword}" (mode: ${mode})`);
      
      // Search for videos
      const searchResult = await this.searchVideos(token, request.keyword, 0);
      apiCalls++;
      
      let allVideos: DouyinVideo[] = searchResult.videos;
      
      // Try to get more videos if available and in deep mode
      if (mode === 'deep' && searchResult.has_more && searchResult.cursor) {
        try {
          await this.sleep(800);
          const page2 = await this.searchVideos(token, request.keyword, searchResult.cursor);
          apiCalls++;
          allVideos = [...allVideos, ...page2.videos];
        } catch (e) {
          console.warn('[Douyin Adapter] Failed to fetch page 2:', e);
        }
      }
      
      console.log(`[Douyin Adapter] Found ${allVideos.length} videos`);
      
      // Determine comment fetching limits based on mode
      const maxVideos = request.config.max_posts || (mode === 'deep' ? 10 : 5);
      const maxCommentsPerVideo = request.config.max_comments_per_post || (mode === 'deep' ? 5 : 4);
      
      const topVideos = allVideos.slice(0, maxVideos);
      let allComments: DouyinComment[] = [];
      
      console.log(`[Douyin Adapter] Fetching comments from ${topVideos.length} videos, ${maxCommentsPerVideo} each`);
      
      for (const video of topVideos) {
        try {
          await this.sleep(800);
          const commentsResult = await this.getVideoComments(token, video.aweme_id, maxCommentsPerVideo);
          apiCalls++;
          
          if (commentsResult.success) {
            // Tag comments with their parent video ID
            const taggedComments = commentsResult.comments.map(c => ({
              ...c,
              _parent_video_id: video.aweme_id
            }));
            allComments = [...allComments, ...taggedComments];
          }
        } catch (e) {
          console.warn(`[Douyin Adapter] Failed to get comments for video ${video.aweme_id}:`, e);
        }
      }
      
      console.log(`[Douyin Adapter] Collected ${allComments.length} comments`);
      
      // Transform to unified format
      const posts = this.transformVideos(allVideos);
      const comments = this.transformComments(allComments);
      
      // Calculate stats
      const stats = this.calculateStats(posts);
      
      return {
        success: true,
        channel: this.channel,
        posts,
        comments,
        stats,
        metadata: {
          crawl_time_ms: Date.now() - startTime,
          api_calls: apiCalls,
          rate_limited: rateLimited,
        },
      };
    } catch (error) {
      console.error('[Douyin Adapter] Crawl failed:', error);
      return this.createEmptyResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }
  
  // ============ Private API Methods ============
  
  private async searchVideos(
    authToken: string,
    keyword: string,
    offset: number = 0,
    retryCount: number = 0
  ): Promise<TikhubDouyinSearchResult> {
    const maxRetries = 3;
    const url = `${TIKHUB_BASE_URL}/api/v1/douyin/web/fetch_video_search_result`;
    const params = new URLSearchParams({
      keyword,
      offset: String(offset),
      count: '20',
      sort_type: '0', // 0=comprehensive, 1=most liked, 2=newest
      publish_time: '0', // 0=all time, 1=day, 7=week, 180=half year
    });
    
    try {
      const response = await fetch(`${url}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      
      if (response.status === 429) {
        console.warn('[Douyin Adapter] Rate limit hit, waiting...');
        await this.sleep(5000);
        if (retryCount < maxRetries) {
          return this.searchVideos(authToken, keyword, offset, retryCount + 1);
        }
      }
      
      if (response.status >= 500 && response.status < 600) {
        if (retryCount < maxRetries) {
          const delay = (retryCount + 1) * 2000;
          console.warn(`[Douyin Adapter] 5xx error, retrying in ${delay}ms...`);
          await this.sleep(delay);
          return this.searchVideos(authToken, keyword, offset, retryCount + 1);
        }
        return { success: false, videos: [], total_count: 0, has_more: false };
      }
      
      if (!response.ok) {
        console.error('[Douyin Adapter] Search error:', response.status);
        return { success: false, videos: [], total_count: 0, has_more: false };
      }
      
      const data = await response.json();
      
      // Parse Tikhub response structure
      const awemeList = data?.data?.data?.aweme_list || data?.data?.aweme_list || [];
      const hasMore = data?.data?.data?.has_more || data?.data?.has_more || false;
      const cursor = data?.data?.data?.cursor || data?.data?.cursor || 0;
      
      const videos: DouyinVideo[] = awemeList.map((item: any) => ({
        aweme_id: item.aweme_id || '',
        desc: item.desc || '',
        author: {
          nickname: item.author?.nickname || '',
          uid: item.author?.uid || '',
          sec_uid: item.author?.sec_uid || '',
        },
        statistics: {
          digg_count: item.statistics?.digg_count || 0,
          comment_count: item.statistics?.comment_count || 0,
          share_count: item.statistics?.share_count || 0,
          collect_count: item.statistics?.collect_count || 0,
          play_count: item.statistics?.play_count || 0,
        },
        create_time: item.create_time,
        video: {
          duration: item.video?.duration || 0,
        },
      }));
      
      return {
        success: true,
        videos,
        total_count: videos.length,
        has_more: hasMore,
        cursor: cursor,
      };
    } catch (error) {
      console.error('[Douyin Adapter] Search exception:', error);
      if (retryCount < maxRetries) {
        const delay = (retryCount + 1) * 2000;
        await this.sleep(delay);
        return this.searchVideos(authToken, keyword, offset, retryCount + 1);
      }
      return { success: false, videos: [], total_count: 0, has_more: false };
    }
  }
  
  private async getVideoComments(
    authToken: string,
    awemeId: string,
    limit: number = 20
  ): Promise<TikhubDouyinCommentsResult> {
    const url = `${TIKHUB_BASE_URL}/api/v1/douyin/web/fetch_video_comments`;
    const params = new URLSearchParams({
      aweme_id: awemeId,
      cursor: '0',
      count: String(limit),
    });
    
    try {
      const response = await fetch(`${url}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      
      if (response.status === 429) {
        console.warn('[Douyin Adapter] Rate limit on comments, waiting...');
        await this.sleep(5000);
        return this.getVideoComments(authToken, awemeId, limit);
      }
      
      if (!response.ok) {
        console.error(`[Douyin Adapter] Comments error for ${awemeId}: ${response.status}`);
        return { success: false, comments: [], total_count: 0, has_more: false };
      }
      
      const data = await response.json();
      
      // Parse Tikhub response structure
      const commentList = data?.data?.data?.comments || data?.data?.comments || [];
      const hasMore = data?.data?.data?.has_more || data?.data?.has_more || false;
      const cursor = data?.data?.data?.cursor || data?.data?.cursor || 0;
      
      const comments: DouyinComment[] = commentList.slice(0, limit).map((item: any) => ({
        cid: item.cid || '',
        text: item.text || '',
        digg_count: item.digg_count || 0,
        user: {
          nickname: item.user?.nickname || '',
          uid: item.user?.uid || '',
        },
        ip_label: item.ip_label || '',
        create_time: item.create_time,
      }));
      
      return {
        success: true,
        comments,
        total_count: comments.length,
        has_more: hasMore,
        cursor: cursor,
      };
    } catch (error) {
      console.error(`[Douyin Adapter] Comments exception for ${awemeId}:`, error);
      return { success: false, comments: [], total_count: 0, has_more: false };
    }
  }
  
  // ============ Data Transformation ============
  
  private transformVideos(videos: DouyinVideo[]): UnifiedPost[] {
    return videos.map(video => ({
      post_id: video.aweme_id,
      platform: this.channel,
      title: video.desc.slice(0, 50), // Use first 50 chars of desc as title
      content: video.desc,
      content_type: 'video', // Douyin is video-first
      author: video.author.nickname,
      metrics: {
        likes: video.statistics.digg_count,
        comments: video.statistics.comment_count,
        shares: video.statistics.share_count,
        collects: video.statistics.collect_count,
        views: video.statistics.play_count,
      },
      created_at: video.create_time ? new Date(video.create_time * 1000).toISOString() : undefined,
      raw_data: video as unknown as Record<string, unknown>,
    }));
  }
  
  private transformComments(comments: (DouyinComment & { _parent_video_id?: string })[]): UnifiedComment[] {
    return comments.map(comment => ({
      comment_id: comment.cid,
      platform: this.channel,
      post_id: comment._parent_video_id || '',
      content: comment.text,
      author: comment.user.nickname,
      metrics: {
        likes: comment.digg_count,
      },
      location: comment.ip_label,
      created_at: comment.create_time ? new Date(comment.create_time * 1000).toISOString() : undefined,
    }));
  }
  
  // ============ Override Content Type Mapping ============
  
  override mapContentTypeToDisplay(type: UnifiedPost['content_type']): string {
    // Douyin is primarily video, so adjust display names
    switch (type) {
      case 'video': return '短视频';
      case 'image': return '图集';
      case 'text': return '文字';
      case 'mixed': return '混合内容';
      default: return '其他';
    }
  }
}
