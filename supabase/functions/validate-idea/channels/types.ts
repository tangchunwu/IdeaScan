/**
 * Multi-Channel Adapter Type Definitions
 * 
 * Unified interface for crawling social media platforms:
 * - Xiaohongshu (小红书)
 * - Douyin (抖音) - future
 * - Weibo (微博) - future
 * - Bilibili (哔哩哔哩) - future
 */

// ============ Universal Post/Comment Types ============

export interface UnifiedPost {
  /** Unique identifier from the platform */
  post_id: string;
  /** Platform source */
  platform: ChannelType;
  /** Post title (if available) */
  title: string;
  /** Post content/description */
  content: string;
  /** Content type: text, image, video, etc. */
  content_type: 'text' | 'image' | 'video' | 'mixed';
  /** Author nickname */
  author: string;
  /** Engagement metrics */
  metrics: {
    likes: number;
    comments: number;
    shares: number;
    collects: number;
    views?: number;
  };
  /** Post creation time (ISO string if available) */
  created_at?: string;
  /** Original platform-specific data */
  raw_data?: Record<string, unknown>;
}

export interface UnifiedComment {
  /** Unique identifier from the platform */
  comment_id: string;
  /** Platform source */
  platform: ChannelType;
  /** Parent post ID */
  post_id: string;
  /** Comment content */
  content: string;
  /** Author nickname */
  author: string;
  /** Engagement metrics */
  metrics: {
    likes: number;
  };
  /** IP location (if available) */
  location?: string;
  /** Comment creation time (ISO string if available) */
  created_at?: string;
}

// ============ Crawl Result Types ============

export interface ChannelCrawlResult {
  /** Whether the crawl was successful */
  success: boolean;
  /** Channel type */
  channel: ChannelType;
  /** Error message if failed */
  error?: string;
  /** Unified posts */
  posts: UnifiedPost[];
  /** Unified comments */
  comments: UnifiedComment[];
  /** Aggregated statistics */
  stats: ChannelStats;
  /** Raw metadata for debugging */
  metadata?: {
    crawl_time_ms: number;
    api_calls: number;
    rate_limited: boolean;
  };
}

export interface ChannelStats {
  /** Total posts found/estimated */
  total_posts: number;
  /** Average engagement metrics */
  avg_likes: number;
  avg_comments: number;
  avg_shares: number;
  avg_collects: number;
  /** Total engagement */
  total_engagement: number;
  /** Weekly trend data */
  weekly_trend: { name: string; value: number }[];
  /** Content type distribution */
  content_types: { name: string; value: number }[];
}

// ============ Channel Configuration ============

export type ChannelType = 'xiaohongshu' | 'douyin' | 'weibo' | 'bilibili';

export interface ChannelConfig {
  /** Authentication token for the API */
  auth_token: string;
  /** Crawl mode affects data quantity */
  mode: 'quick' | 'deep';
  /** Maximum posts to fetch */
  max_posts?: number;
  /** Maximum comments per post */
  max_comments_per_post?: number;
}

export interface CrawlRequest {
  /** Search keyword/idea */
  keyword: string;
  /** Optional tags for context */
  tags?: string[];
  /** Channel-specific configuration */
  config: ChannelConfig;
}

// ============ Channel Adapter Interface ============

export interface ChannelAdapter {
  /** Channel identifier */
  readonly channel: ChannelType;
  
  /** Human-readable channel name */
  readonly displayName: string;
  
  /** Check if the adapter is configured and ready */
  isConfigured(): boolean;
  
  /** Execute the crawl operation */
  crawl(request: CrawlRequest): Promise<ChannelCrawlResult>;
}

// ============ Multi-Channel Orchestrator Types ============

export interface MultiChannelRequest {
  keyword: string;
  tags?: string[];
  channels: {
    type: ChannelType;
    config: ChannelConfig;
  }[];
}

export interface MultiChannelResult {
  success: boolean;
  results: ChannelCrawlResult[];
  /** Combined statistics across all channels */
  combined_stats: ChannelStats;
  /** Which channels succeeded */
  succeeded_channels: ChannelType[];
  /** Which channels failed */
  failed_channels: { channel: ChannelType; error: string }[];
}
