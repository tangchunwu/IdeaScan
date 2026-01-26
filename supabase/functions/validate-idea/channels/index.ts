/**
 * Multi-Channel Adapter Module
 * 
 * Provides a unified interface for crawling social media platforms.
 * 
 * Supported Channels:
 * - Xiaohongshu (小红书) ✅
 * - Douyin (抖音) - coming soon
 * - Weibo (微博) - coming soon
 * - Bilibili (哔哩哔哩) - coming soon
 * 
 * Usage:
 * ```ts
 * import { multiChannelOrchestrator } from './channels/index.ts';
 * 
 * const result = await multiChannelOrchestrator.crawlChannel(
 *   'xiaohongshu',
 *   '智能家居',
 *   { auth_token: 'xxx', mode: 'quick' }
 * );
 * ```
 */

// Types
export type {
  ChannelType,
  ChannelConfig,
  ChannelAdapter,
  ChannelCrawlResult,
  ChannelStats,
  CrawlRequest,
  UnifiedPost,
  UnifiedComment,
  MultiChannelRequest,
  MultiChannelResult,
} from './types.ts';

// Base adapter (for extension)
export { BaseChannelAdapter } from './base-adapter.ts';

// Channel adapters
export { XiaohongshuAdapter } from './xiaohongshu-adapter.ts';

// Registry and orchestrator
export { 
  channelRegistry, 
  multiChannelOrchestrator,
  MultiChannelOrchestrator,
} from './channel-registry.ts';

// ============ Convenience Functions ============

import { multiChannelOrchestrator } from './channel-registry.ts';
import type { ChannelCrawlResult, ChannelConfig } from './types.ts';

/**
 * Crawl Xiaohongshu data (backward compatible with existing code)
 */
export async function crawlXiaohongshu(
  keyword: string,
  config: ChannelConfig,
  tags?: string[]
): Promise<ChannelCrawlResult> {
  return multiChannelOrchestrator.crawlChannel('xiaohongshu', keyword, config, tags);
}

/**
 * Convert ChannelCrawlResult to legacy format for backward compatibility
 */
export function toLegacyXhsFormat(result: ChannelCrawlResult): {
  totalNotes: number;
  avgLikes: number;
  avgComments: number;
  avgCollects: number;
  totalEngagement: number;
  weeklyTrend: { name: string; value: number }[];
  contentTypes: { name: string; value: number }[];
  sampleNotes: any[];
  sampleComments: any[];
} {
  return {
    totalNotes: result.stats.total_posts,
    avgLikes: result.stats.avg_likes,
    avgComments: result.stats.avg_comments,
    avgCollects: result.stats.avg_collects,
    totalEngagement: result.stats.total_engagement,
    weeklyTrend: result.stats.weekly_trend,
    contentTypes: result.stats.content_types,
    sampleNotes: result.posts.map(p => ({
      note_id: p.post_id,
      title: p.title,
      desc: p.content,
      type: p.content_type === 'video' ? 'video' : 'normal',
      liked_count: p.metrics.likes,
      collected_count: p.metrics.collects,
      comments_count: p.metrics.comments,
      shared_count: p.metrics.shares,
      user_nickname: p.author,
    })),
    sampleComments: result.comments.map(c => ({
      comment_id: c.comment_id,
      content: c.content,
      like_count: c.metrics.likes,
      user_nickname: c.author,
      ip_location: c.location || '',
    })),
  };
}
