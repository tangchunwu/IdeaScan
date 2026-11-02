import type { MultiChannelResult } from "./channels/types.ts";

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

export function overseasToSocialData(data: any) {
  const notes: any[] = [];
  const comments: any[] = [];
  let totalNotes = 0;
  let totalLikes = 0;
  let totalComments = 0;
  for (const [platform, result] of Object.entries(data?.platforms || {}) as Array<[string, any]>) {
    if (result?.status !== "success") continue;
    for (const post of result.posts || []) {
      const metrics = post.metrics || {};
      notes.push({ note_id: post.post_id, title: `[${platform}] ${post.title || ""}`, desc: post.content || "", type: post.content_type, liked_count: Number(metrics.likes || 0), comments_count: Number(metrics.comments || 0), collected_count: Number(metrics.collects || 0), shared_count: Number(metrics.shares || 0), user_nickname: post.author || "", _platform: platform });
      totalLikes += Number(metrics.likes || 0);
      totalComments += Number(metrics.comments || 0);
    }
    for (const comment of result.comments || []) comments.push({ comment_id: comment.comment_id, content: comment.content || "", like_count: Number(comment.metrics?.likes || 0), user_nickname: comment.author || "", ip_location: comment.location || "", post_id: comment.post_id, _platform: platform });
    totalNotes += Number(result.posts?.length || 0);
  }
  return { totalNotes, avgLikes: totalNotes ? Math.round(totalLikes / totalNotes) : 0, avgComments: totalNotes ? Math.round(totalComments / totalNotes) : 0, avgCollects: 0, sampleNotes: notes, sampleComments: comments };
}
