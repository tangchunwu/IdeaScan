export type CrawlerMode = "quick" | "deep";
export type CrawlerPlatform = "xiaohongshu" | "douyin";

export interface CrawlerJobLimits {
  notes: number;
  comments_per_note: number;
}

export interface CrawlerJobRequest {
  validation_id: string;
  trace_id: string;
  query: string;
  platforms: CrawlerPlatform[];
  mode: CrawlerMode;
  limits: CrawlerJobLimits;
  freshness_days: number;
  timeout_ms: number;
}

export interface CrawlerNormalizedNote {
  id: string;
  title: string;
  desc: string;
  liked_count: number;
  comments_count: number;
  collected_count: number;
  published_at: string | null;
  platform: string;
  url?: string;
}

export interface CrawlerNormalizedComment {
  id: string;
  content: string;
  like_count: number;
  user_nickname: string;
  ip_location: string;
  published_at: string | null;
  platform: string;
  parent_id?: string;
}

export interface CrawlerPlatformResult {
  platform: string;
  notes: CrawlerNormalizedNote[];
  comments: CrawlerNormalizedComment[];
  success: boolean;
  latency_ms?: number;
  error?: string;
}

export interface CrawlerResultPayload {
  job_id: string;
  status: "completed" | "failed" | "cancelled";
  platform_results: CrawlerPlatformResult[];
  quality: {
    sample_count: number;
    comment_count: number;
    freshness_score: number;
    dup_ratio: number;
  };
  cost: {
    external_api_calls: number;
    proxy_calls: number;
    est_cost: number;
  };
  errors: string[];
}

export interface RoutedSocialData {
  totalNotes: number;
  avgLikes: number;
  avgComments: number;
  avgCollects: number;
  totalEngagement?: number;
  weeklyTrend?: Array<{ name: string; value: number }>;
  contentTypes?: Array<{ name: string; value: number }>;
  sampleNotes: Record<string, unknown>[];
  sampleComments: Record<string, unknown>[];
}

export function buildCrawlerLimits(mode: CrawlerMode): CrawlerJobLimits {
  if (mode === "deep") {
    return { notes: 12, comments_per_note: 6 };
  }
  return { notes: 6, comments_per_note: 3 };
}

export function normalizeCrawlerPlatforms(enableXiaohongshu: boolean, enableDouyin: boolean): CrawlerPlatform[] {
  const platforms: CrawlerPlatform[] = [];
  if (enableXiaohongshu) platforms.push("xiaohongshu");
  if (enableDouyin) platforms.push("douyin");
  return platforms;
}

export function buildTraceId(prefix: string, validationId: string, userId: string): string {
  const seed = `${prefix}:${validationId}:${userId}:${Date.now()}`;
  return seed.slice(0, 120);
}

export function normalizeCrawlerResultToSocialData(payload: CrawlerResultPayload): RoutedSocialData {
  const notes = payload.platform_results.flatMap((item) => item.notes || []);
  const comments = payload.platform_results.flatMap((item) => item.comments || []);

  const sampleNotes = notes.map((note) => ({
    note_id: note.id,
    title: `[${note.platform}] ${note.title || ""}`.trim(),
    desc: note.desc || "",
    liked_count: Number(note.liked_count || 0),
    comments_count: Number(note.comments_count || 0),
    collected_count: Number(note.collected_count || 0),
    publish_time: note.published_at || null,
    source_url: note.url || "",
    _platform: note.platform,
  }));

  const sampleComments = comments.map((comment) => ({
    comment_id: comment.id,
    content: comment.content || "",
    like_count: Number(comment.like_count || 0),
    user_nickname: comment.user_nickname || "",
    ip_location: comment.ip_location || "",
    create_time: comment.published_at || null,
    parent_id: comment.parent_id || "",
    _platform: comment.platform,
  }));

  const avgLikes = sampleNotes.length > 0
    ? Math.round(sampleNotes.reduce((sum, n: any) => sum + Number(n.liked_count || 0), 0) / sampleNotes.length)
    : 0;
  const avgComments = sampleNotes.length > 0
    ? Math.round(sampleNotes.reduce((sum, n: any) => sum + Number(n.comments_count || 0), 0) / sampleNotes.length)
    : 0;
  const avgCollects = sampleNotes.length > 0
    ? Math.round(sampleNotes.reduce((sum, n: any) => sum + Number(n.collected_count || 0), 0) / sampleNotes.length)
    : 0;

  const totalEngagement = sampleNotes.reduce(
    (sum, n: any) => sum + Number(n.liked_count || 0) + Number(n.comments_count || 0) + Number(n.collected_count || 0),
    0
  );

  return {
    totalNotes: sampleNotes.length,
    avgLikes,
    avgComments,
    avgCollects,
    totalEngagement,
    weeklyTrend: [],
    contentTypes: [],
    sampleNotes,
    sampleComments,
  };
}
