import type { MultiChannelResult } from "../validate-idea/channels/types.ts";

export const OVERSEAS_PLATFORMS = ["tiktok", "instagram", "youtube", "reddit"] as const;
export type OverseasPlatform = typeof OVERSEAS_PLATFORMS[number];

export function buildOverseasSocialData(requestedPlatforms: string[], result: MultiChannelResult) {
  const platforms: Record<string, unknown> = {};
  let totalPosts = 0;
  let totalComments = 0;
  let totalEngagement = 0;
  for (const item of result.results) {
    const stats = item.stats;
    const posts = item.posts.length;
    const comments = item.comments.length;
    const engagement = stats.total_engagement || 0;
    platforms[item.channel] = {
      status: item.success ? "success" : "error",
      posts: item.posts,
      comments: item.comments,
      stats,
      metadata: item.metadata || null,
      error: item.error || null,
    };
    totalPosts += posts;
    totalComments += comments;
    totalEngagement += engagement;
  }
  return {
    schemaVersion: 1,
    fetchedAt: new Date().toISOString(),
    requestedPlatforms: Array.from(new Set(requestedPlatforms)),
    platforms,
    aggregate: { totalPosts, totalComments, totalEngagement },
  };
}
