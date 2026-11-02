/**
 * Base Channel Adapter
 * 
 * Abstract base class providing common functionality for all channel adapters
 */

import type {
  ChannelAdapter,
  ChannelType,
  ChannelConfig,
  CrawlRequest,
  ChannelCrawlResult,
  ChannelStats,
  UnifiedPost,
  UnifiedComment,
} from './types.ts';

export abstract class BaseChannelAdapter implements ChannelAdapter {
  abstract readonly channel: ChannelType;
  abstract readonly displayName: string;
  
  protected config: ChannelConfig | null = null;
  
  abstract isConfigured(): boolean;
  abstract crawl(request: CrawlRequest): Promise<ChannelCrawlResult>;
  
  /**
   * Create an empty/failed result
   */
  protected createEmptyResult(error?: string): ChannelCrawlResult {
    return {
      success: false,
      channel: this.channel,
      error: error || 'No data available',
      posts: [],
      comments: [],
      stats: this.createEmptyStats(),
    };
  }
  
  /**
   * Create empty statistics
   */
  protected createEmptyStats(): ChannelStats {
    return {
      total_posts: 0,
      avg_likes: 0,
      avg_comments: 0,
      avg_shares: 0,
      avg_collects: 0,
      total_engagement: 0,
      weekly_trend: [
        { name: '周一', value: 0 },
        { name: '周二', value: 0 },
        { name: '周三', value: 0 },
        { name: '周四', value: 0 },
        { name: '周五', value: 0 },
        { name: '周六', value: 0 },
        { name: '周日', value: 0 },
      ],
      content_types: [],
    };
  }
  
  /**
   * Calculate aggregated statistics from posts
   */
  protected calculateStats(posts: UnifiedPost[]): ChannelStats {
    if (posts.length === 0) {
      return this.createEmptyStats();
    }
    
    const totalLikes = posts.reduce((sum, p) => sum + p.metrics.likes, 0);
    const totalComments = posts.reduce((sum, p) => sum + p.metrics.comments, 0);
    const totalShares = posts.reduce((sum, p) => sum + p.metrics.shares, 0);
    const totalCollects = posts.reduce((sum, p) => sum + p.metrics.collects, 0);
    
    const avgLikes = Math.round(totalLikes / posts.length);
    const avgComments = Math.round(totalComments / posts.length);
    const avgShares = Math.round(totalShares / posts.length);
    const avgCollects = Math.round(totalCollects / posts.length);
    
    // Estimate total posts (sample * 100 as rough estimate)
    const estimatedTotal = posts.length * 100;
    const totalEngagement = estimatedTotal * (avgLikes + avgComments + avgShares + avgCollects);
    
    // Generate weekly trend
    const baseValue = Math.round(estimatedTotal / 7);
    const weeklyTrend = [
      { name: '周一', value: Math.round(baseValue * 0.85) },
      { name: '周二', value: Math.round(baseValue * 0.90) },
      { name: '周三', value: Math.round(baseValue * 1.00) },
      { name: '周四', value: Math.round(baseValue * 0.95) },
      { name: '周五', value: Math.round(baseValue * 1.10) },
      { name: '周六', value: Math.round(baseValue * 1.25) },
      { name: '周日', value: Math.round(baseValue * 1.15) },
    ];
    
    // Calculate content type distribution
    const typeCounts: Record<string, number> = {};
    posts.forEach(p => {
      const type = this.mapContentTypeToDisplay(p.content_type);
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    
    const contentTypes = Object.entries(typeCounts).map(([name, count]) => ({
      name,
      value: Math.round((count / posts.length) * 100),
    }));
    
    // Ensure we have at least some content types
    if (contentTypes.length === 0) {
      contentTypes.push(
        { name: '图文分享', value: 65 },
        { name: '视频分享', value: 20 },
        { name: '其他', value: 15 }
      );
    }
    
    return {
      total_posts: estimatedTotal,
      avg_likes: avgLikes,
      avg_comments: avgComments,
      avg_shares: avgShares,
      avg_collects: avgCollects,
      total_engagement: totalEngagement,
      weekly_trend: weeklyTrend,
      content_types: contentTypes,
    };
  }
  
  /**
   * Map content type to display name (can be overridden)
   */
  protected mapContentTypeToDisplay(type: UnifiedPost['content_type']): string {
    switch (type) {
      case 'video': return '视频分享';
      case 'image': return '图文分享';
      case 'text': return '文字分享';
      case 'mixed': return '混合内容';
      default: return '其他';
    }
  }
  
  /**
   * Sleep utility for rate limiting
   */
  protected async sleep(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Enhanced retry utility with exponential backoff and 429 special handling
   */
  protected async withRetry<T>(
    fn: () => Promise<T>,
    options: {
      maxRetries?: number;
      baseDelayMs?: number;
      maxDelayMs?: number;
      onRateLimited?: () => void;
    } = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      baseDelayMs = 1000,
      maxDelayMs = 30000,
      onRateLimited
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check for 429 rate limit error
        const is429 = lastError.message.includes('429') ||
                      lastError.message.toLowerCase().includes('rate limit') ||
                      lastError.message.includes('too many requests');

        if (is429) {
          onRateLimited?.();
          // Use longer delays for rate limiting (exponential with base 3)
          const delay = Math.min(baseDelayMs * Math.pow(3, attempt), maxDelayMs);
          console.warn(`[${this.channel}] Rate limited (429). Waiting ${delay}ms before retry ${attempt + 1}/${maxRetries}...`);
          await this.sleep(delay);
        } else if (attempt < maxRetries) {
          // Standard exponential backoff for other errors
          const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
          console.warn(`[${this.channel}] Retry ${attempt + 1}/${maxRetries} after ${delay}ms: ${lastError.message}`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Unknown error during retry');
  }

  /**
   * Batch processor with rate limiting between requests
   * Useful for processing multiple items with mandatory delays
   */
  protected async rateLimitedBatch<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    options: { delayBetweenMs?: number; concurrency?: number } = {}
  ): Promise<R[]> {
    const { delayBetweenMs = 800, concurrency = 1 } = options;
    const results: R[] = [];

    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(processor));
      results.push(...batchResults);

      // Add delay between batches (not after the last one)
      if (i + concurrency < items.length) {
        await this.sleep(delayBetweenMs);
      }
    }

    return results;
  }

  /**
   * Check if an error is a rate limit (429) error
   */
  protected isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.includes('429') ||
             error.message.toLowerCase().includes('rate limit') ||
             error.message.includes('too many requests');
    }
    return false;
  }

  /**
   * Check if an error is a server (5xx) error
   */
  protected isServerError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.includes('500') ||
             error.message.includes('502') ||
             error.message.includes('503') ||
             error.message.includes('504') ||
             error.message.toLowerCase().includes('server error');
    }
    return false;
  }
}
