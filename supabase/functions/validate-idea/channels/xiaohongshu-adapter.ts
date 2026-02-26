/**
 * Xiaohongshu (小红书) Channel Adapter
 * 
 * Implements the ChannelAdapter interface for crawling Xiaohongshu data
 * via the Tikhub API.
 */

import { BaseChannelAdapter } from './base-adapter.ts';
import type {
  ChannelType,
  CrawlRequest,
  ChannelCrawlResult,
  UnifiedPost,
  UnifiedComment,
} from './types.ts';

// ============ Tikhub API Types ============

interface XhsNote {
  note_id: string;
  title: string;
  desc: string;
  type: string;
  liked_count: number;
  collected_count: number;
  comments_count: number;
  shared_count: number;
  user_nickname: string;
}

interface XhsComment {
  comment_id: string;
  content: string;
  like_count: number;
  user_nickname: string;
  ip_location: string;
}

interface TikhubSearchResult {
  success: boolean;
  notes: XhsNote[];
  total_count: number;
}

interface TikhubCommentsResult {
  success: boolean;
  comments: XhsComment[];
  total_count: number;
}

const TIKHUB_BASE_URL = 'https://api.tikhub.io';

// ============ Xiaohongshu Adapter ============

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
    let apiCalls = 0;
    let rateLimited = false;
    
    // Use provided token or instance token
    const token = request.config.auth_token || this.authToken;
    
    if (!token) {
      console.log('[XHS Adapter] No auth token configured');
      return this.createEmptyResult('Tikhub token not configured');
    }
    
    try {
      const mode = request.config.mode || 'quick';
      console.log(`[XHS Adapter] Crawling for: "${request.keyword}" (mode: ${mode})`);
      
      // Search for notes
      const searchResult = await this.searchNotes(token, request.keyword, 1);
      apiCalls++;
      
      let allNotes: XhsNote[] = searchResult.notes;
      
      // Try second page if first has results
      if (searchResult.notes.length > 0) {
        try {
          await this.sleep(800);
          const page2 = await this.searchNotes(token, request.keyword, 2);
          apiCalls++;
          allNotes = [...allNotes, ...page2.notes];
        } catch (e) {
          console.warn('[XHS Adapter] Failed to fetch page 2:', e);
        }
      }
      
      console.log(`[XHS Adapter] Found ${allNotes.length} notes`);
      
      // Determine comment fetching limits based on mode
      const maxPosts = request.config.max_posts || (mode === 'deep' ? 10 : 5);
      const maxCommentsPerPost = request.config.max_comments_per_post || (mode === 'deep' ? 5 : 4);
      
      const topNotes = allNotes.slice(0, maxPosts);
      let allComments: XhsComment[] = [];
      
      console.log(`[XHS Adapter] Fetching comments from ${topNotes.length} notes, ${maxCommentsPerPost} each`);
      
      for (const note of topNotes) {
        try {
          await this.sleep(800);
          const commentsResult = await this.getNoteComments(token, note.note_id, maxCommentsPerPost);
          apiCalls++;
          
          if (commentsResult.success) {
            allComments = [...allComments, ...commentsResult.comments];
          }
        } catch (e) {
          console.warn(`[XHS Adapter] Failed to get comments for note ${note.note_id}:`, e);
        }
      }
      
      console.log(`[XHS Adapter] Collected ${allComments.length} comments`);
      
      // Transform to unified format
      const posts = this.transformPosts(allNotes);
      const comments = this.transformComments(allComments, allNotes);
      
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
      console.error('[XHS Adapter] Crawl failed:', error);
      return this.createEmptyResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }
  
  // ============ Private API Methods ============
  
  private async searchNotes(
    authToken: string,
    keyword: string,
    page: number = 1,
    retryCount: number = 0
  ): Promise<TikhubSearchResult> {
    const maxRetries = 3;
    const url = `${TIKHUB_BASE_URL}/api/v1/xiaohongshu/web/search_notes`;
    const params = new URLSearchParams({
      keyword,
      page: String(page),
      sort: 'general',
      note_type: '0',
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
        console.warn('[XHS Adapter] Rate limit hit, waiting...');
        await this.sleep(5000);
        if (retryCount < maxRetries) {
          return this.searchNotes(authToken, keyword, page, retryCount + 1);
        }
      }
      
      if (response.status >= 500 && response.status < 600) {
        if (retryCount < maxRetries) {
          const delay = (retryCount + 1) * 2000;
          console.warn(`[XHS Adapter] 5xx error, retrying in ${delay}ms...`);
          await this.sleep(delay);
          return this.searchNotes(authToken, keyword, page, retryCount + 1);
        }
        return { success: false, notes: [], total_count: 0 };
      }
      
      if (!response.ok) {
        console.error('[XHS Adapter] Search error:', response.status);
        return { success: false, notes: [], total_count: 0 };
      }
      
      const data = await response.json();
      const items = data?.data?.data?.items || [];
      
      const notes: XhsNote[] = items.map((item: any) => {
        const note = item.note || item;
        return {
          note_id: note.id || '',
          title: note.title || '',
          desc: note.desc || '',
          type: note.type || 'normal',
          liked_count: note.liked_count || 0,
          collected_count: note.collected_count || 0,
          comments_count: note.comments_count || 0,
          shared_count: note.shared_count || 0,
          user_nickname: note.user?.nickname || '',
        };
      });
      
      return {
        success: true,
        notes,
        total_count: notes.length,
      };
    } catch (error) {
      console.error('[XHS Adapter] Search exception:', error);
      if (retryCount < maxRetries) {
        const delay = (retryCount + 1) * 2000;
        await this.sleep(delay);
        return this.searchNotes(authToken, keyword, page, retryCount + 1);
      }
      return { success: false, notes: [], total_count: 0 };
    }
  }
  
  private async getNoteComments(
    authToken: string,
    noteId: string,
    limit: number = 20,
    retryCount: number = 0
  ): Promise<TikhubCommentsResult> {
    const maxRetries = 3;
    const url = `${TIKHUB_BASE_URL}/api/v1/xiaohongshu/web/get_note_comments`;
    
    try {
      const response = await fetch(`${url}?note_id=${noteId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      
      if (response.status === 429) {
        console.warn('[XHS Adapter] Rate limit on comments, waiting...');
        if (retryCount < maxRetries) {
          await this.sleep(5000);
          return this.getNoteComments(authToken, noteId, limit, retryCount + 1);
        }
        return { success: false, comments: [], total_count: 0 };
      }
      
      if (!response.ok) {
        console.error(`[XHS Adapter] Comments error for ${noteId}: ${response.status}`);
        return { success: false, comments: [], total_count: 0 };
      }
      
      const data = await response.json();
      const commentItems = data?.data?.data?.comments || [];
      
      const comments: XhsComment[] = commentItems.slice(0, limit).map((item: any) => ({
        comment_id: item.id || '',
        content: item.content || '',
        like_count: item.like_count || 0,
        user_nickname: item.user?.nickname || '',
        ip_location: item.ip_location || '',
      }));
      
      return {
        success: true,
        comments,
        total_count: comments.length,
      };
    } catch (error) {
      console.error(`[XHS Adapter] Comments exception for ${noteId}:`, error);
      return { success: false, comments: [], total_count: 0 };
    }
  }
  
  // ============ Data Transformation ============
  
  private transformPosts(notes: XhsNote[]): UnifiedPost[] {
    return notes.map(note => ({
      post_id: note.note_id,
      platform: this.channel,
      title: note.title,
      content: note.desc,
      content_type: note.type === 'video' ? 'video' : 'image',
      author: note.user_nickname,
      metrics: {
        likes: note.liked_count,
        comments: note.comments_count,
        shares: note.shared_count,
        collects: note.collected_count,
      },
      raw_data: note as unknown as Record<string, unknown>,
    }));
  }
  
  private transformComments(comments: XhsComment[], notes: XhsNote[]): UnifiedComment[] {
    // Map comments to their parent posts (simplified - assigns to first note)
    const firstNoteId = notes[0]?.note_id || '';
    
    return comments.map(comment => ({
      comment_id: comment.comment_id,
      platform: this.channel,
      post_id: firstNoteId, // Simplified mapping
      content: comment.content,
      author: comment.user_nickname,
      metrics: {
        likes: comment.like_count,
      },
      location: comment.ip_location,
    }));
  }
}
