/**
 * Channel Registry
 * 
 * Central registry for managing and accessing channel adapters.
 * Provides factory methods and orchestration for multi-channel crawling.
 */

import type {
  ChannelAdapter,
  ChannelType,
  ChannelConfig,
  CrawlRequest,
  ChannelCrawlResult,
  ChannelStats,
  MultiChannelRequest,
  MultiChannelResult,
} from './types.ts';
import { XiaohongshuAdapter } from './xiaohongshu-adapter.ts';

// ============ Channel Registry ============

class ChannelRegistry {
  private adapters: Map<ChannelType, ChannelAdapter> = new Map();
  private static instance: ChannelRegistry;
  
  private constructor() {
    // Register built-in adapters
    this.registerAdapter(new XiaohongshuAdapter());
    
    // Future adapters will be registered here:
    // this.registerAdapter(new DouyinAdapter());
    // this.registerAdapter(new WeiboAdapter());
    // this.registerAdapter(new BilibiliAdapter());
  }
  
  static getInstance(): ChannelRegistry {
    if (!ChannelRegistry.instance) {
      ChannelRegistry.instance = new ChannelRegistry();
    }
    return ChannelRegistry.instance;
  }
  
  registerAdapter(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.channel, adapter);
    console.log(`[Registry] Registered adapter: ${adapter.displayName} (${adapter.channel})`);
  }
  
  getAdapter(channel: ChannelType): ChannelAdapter | undefined {
    return this.adapters.get(channel);
  }
  
  getAllAdapters(): ChannelAdapter[] {
    return Array.from(this.adapters.values());
  }
  
  getAvailableChannels(): { type: ChannelType; name: string; configured: boolean }[] {
    return this.getAllAdapters().map(adapter => ({
      type: adapter.channel,
      name: adapter.displayName,
      configured: adapter.isConfigured(),
    }));
  }
}

// ============ Multi-Channel Orchestrator ============

export class MultiChannelOrchestrator {
  private registry = ChannelRegistry.getInstance();
  
  /**
   * Crawl a single channel
   */
  async crawlChannel(
    channel: ChannelType,
    keyword: string,
    config: ChannelConfig,
    tags?: string[]
  ): Promise<ChannelCrawlResult> {
    const adapter = this.registry.getAdapter(channel);
    
    if (!adapter) {
      return {
        success: false,
        channel,
        error: `Unknown channel: ${channel}`,
        posts: [],
        comments: [],
        stats: this.createEmptyStats(),
      };
    }
    
    const request: CrawlRequest = {
      keyword,
      tags,
      config,
    };
    
    return adapter.crawl(request);
  }
  
  /**
   * Crawl multiple channels in parallel
   */
  async crawlMultipleChannels(request: MultiChannelRequest): Promise<MultiChannelResult> {
    const results: ChannelCrawlResult[] = [];
    const succeededChannels: ChannelType[] = [];
    const failedChannels: { channel: ChannelType; error: string }[] = [];
    
    // Execute all channel crawls in parallel
    const crawlPromises = request.channels.map(async ({ type, config }) => {
      try {
        const result = await this.crawlChannel(type, request.keyword, config, request.tags);
        return { type, result };
      } catch (error) {
        return {
          type,
          result: {
            success: false,
            channel: type,
            error: error instanceof Error ? error.message : 'Unknown error',
            posts: [],
            comments: [],
            stats: this.createEmptyStats(),
          } as ChannelCrawlResult,
        };
      }
    });
    
    const crawlResults = await Promise.all(crawlPromises);
    
    for (const { type, result } of crawlResults) {
      results.push(result);
      
      if (result.success) {
        succeededChannels.push(type);
      } else {
        failedChannels.push({ channel: type, error: result.error || 'Unknown error' });
      }
    }
    
    // Combine statistics from all successful results
    const combinedStats = this.combineStats(
      results.filter(r => r.success).map(r => r.stats)
    );
    
    return {
      success: succeededChannels.length > 0,
      results,
      combined_stats: combinedStats,
      succeeded_channels: succeededChannels,
      failed_channels: failedChannels,
    };
  }
  
  /**
   * Combine statistics from multiple channels
   */
  private combineStats(statsArray: ChannelStats[]): ChannelStats {
    if (statsArray.length === 0) {
      return this.createEmptyStats();
    }
    
    if (statsArray.length === 1) {
      return statsArray[0];
    }
    
    const totalPosts = statsArray.reduce((sum, s) => sum + s.total_posts, 0);
    const avgLikes = Math.round(statsArray.reduce((sum, s) => sum + s.avg_likes, 0) / statsArray.length);
    const avgComments = Math.round(statsArray.reduce((sum, s) => sum + s.avg_comments, 0) / statsArray.length);
    const avgShares = Math.round(statsArray.reduce((sum, s) => sum + s.avg_shares, 0) / statsArray.length);
    const avgCollects = Math.round(statsArray.reduce((sum, s) => sum + s.avg_collects, 0) / statsArray.length);
    const totalEngagement = statsArray.reduce((sum, s) => sum + s.total_engagement, 0);
    
    // Combine weekly trends
    const weeklyTrend = statsArray[0].weekly_trend.map((day, index) => ({
      name: day.name,
      value: statsArray.reduce((sum, s) => sum + (s.weekly_trend[index]?.value || 0), 0),
    }));
    
    // Combine content types
    const contentTypeMap: Record<string, number> = {};
    statsArray.forEach(s => {
      s.content_types.forEach(ct => {
        contentTypeMap[ct.name] = (contentTypeMap[ct.name] || 0) + ct.value;
      });
    });
    
    const contentTypes = Object.entries(contentTypeMap)
      .map(([name, value]) => ({ name, value: Math.round(value / statsArray.length) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    
    return {
      total_posts: totalPosts,
      avg_likes: avgLikes,
      avg_comments: avgComments,
      avg_shares: avgShares,
      avg_collects: avgCollects,
      total_engagement: totalEngagement,
      weekly_trend: weeklyTrend,
      content_types: contentTypes,
    };
  }
  
  private createEmptyStats(): ChannelStats {
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
   * Get list of available channels
   */
  getAvailableChannels() {
    return this.registry.getAvailableChannels();
  }
}

// ============ Exports ============

export const channelRegistry = ChannelRegistry.getInstance();
export const multiChannelOrchestrator = new MultiChannelOrchestrator();

// Re-export XiaohongshuAdapter for direct use
export { XiaohongshuAdapter } from './xiaohongshu-adapter.ts';
