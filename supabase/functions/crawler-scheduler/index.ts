// Phase 7: Idea Discovery - Crawler Scheduler
// This Edge Function is designed to be called by Supabase Cron or pg_cron
// It fetches active scan_jobs and triggers crawls for each keyword set

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ScanJob {
        id: string;
        keywords: string[];
        platforms: string[];
        frequency: string;
        last_run_at: string | null;
}

interface CrawlResult {
        content: string;
        source: string;
        source_id?: string;
        source_url?: string;
        content_type: string;
        author_name?: string;
        likes_count?: number;
        comments_count?: number;
}

// Simple MD5-like hash for deduplication
async function hashContent(content: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(content);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// Crawl Xiaohongshu using Tikhub API (reusing existing channel adapter)
async function crawlXiaohongshu(keywords: string[], tikhubToken: string): Promise<CrawlResult[]> {
        const results: CrawlResult[] = [];

        for (const keyword of keywords.slice(0, 3)) { // Limit to 3 keywords per run to control costs
                try {
                        const searchUrl = `https://api.tikhub.io/api/v1/xiaohongshu/web/search_notes?keyword=${encodeURIComponent(keyword)}&page=1&sort=general`;

                        const response = await fetch(searchUrl, {
                                headers: {
                                        "Authorization": `Bearer ${tikhubToken}`,
                                        "Content-Type": "application/json"
                                }
                        });

                        if (!response.ok) {
                                console.error(`Tikhub XHS search failed for "${keyword}":`, response.status);
                                continue;
                        }

                        const data = await response.json();
                        const notes = data?.data?.notes || [];

                        for (const note of notes.slice(0, 10)) { // Top 10 notes per keyword
                                results.push({
                                        content: `${note.title || ""}\n${note.desc || ""}`.trim(),
                                        source: "xiaohongshu",
                                        source_id: note.note_id,
                                        source_url: `https://www.xiaohongshu.com/explore/${note.note_id}`,
                                        content_type: "post",
                                        author_name: note.user?.nickname,
                                        likes_count: note.liked_count || 0,
                                        comments_count: note.comments_count || 0
                                });
                        }

                        console.log(`[XHS] Found ${notes.length} notes for "${keyword}"`);
                } catch (e) {
                        console.error(`[XHS] Error crawling "${keyword}":`, e);
                }
        }

        return results;
}

// Crawl Reddit using free API (no auth needed for public subreddits)
async function crawlReddit(keywords: string[]): Promise<CrawlResult[]> {
        const results: CrawlResult[] = [];

        for (const keyword of keywords.slice(0, 3)) {
                try {
                        // Search across Reddit
                        const searchUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(keyword)}&sort=new&limit=20`;

                        const response = await fetch(searchUrl, {
                                headers: {
                                        "User-Agent": "IdeaDiscovery/1.0 (Supabase Edge Function)"
                                }
                        });

                        if (!response.ok) {
                                console.error(`Reddit search failed for "${keyword}":`, response.status);
                                continue;
                        }

                        const data = await response.json();
                        const posts = data?.data?.children || [];

                        for (const post of posts) {
                                const p = post.data;
                                if (!p.selftext && !p.title) continue;

                                results.push({
                                        content: `${p.title}\n${p.selftext || ""}`.trim().slice(0, 2000),
                                        source: "reddit",
                                        source_id: p.id,
                                        source_url: `https://reddit.com${p.permalink}`,
                                        content_type: "post",
                                        author_name: p.author,
                                        likes_count: p.score || 0,
                                        comments_count: p.num_comments || 0
                                });
                        }

                        console.log(`[Reddit] Found ${posts.length} posts for "${keyword}"`);
                } catch (e) {
                        console.error(`[Reddit] Error crawling "${keyword}":`, e);
                }
        }

        return results;
}

serve(async (req) => {
        if (req.method === "OPTIONS") {
                return new Response("ok", { headers: corsHeaders });
        }

        try {
                const supabase = createClient(
                        Deno.env.get("SUPABASE_URL") ?? "",
                        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
                );

		// TikHub token is user-only; scheduler cannot use system token
		const tikhubToken: string | undefined = undefined;

                // 1. Fetch active scan jobs that are due
                const { data: jobs, error: jobsError } = await supabase
                        .from("scan_jobs")
                        .select("*")
                        .eq("status", "active")
                        .or(`next_run_at.is.null,next_run_at.lte.${new Date().toISOString()}`);

                if (jobsError) {
                        console.error("Failed to fetch scan jobs:", jobsError);
                        throw new Error("Failed to fetch scan jobs");
                }

                console.log(`[Scheduler] Found ${jobs?.length || 0} jobs to process`);

                let totalSignals = 0;
                const processedJobs: string[] = [];

                for (const job of (jobs as ScanJob[]) || []) {
                        console.log(`[Scheduler] Processing job ${job.id}: keywords=${job.keywords.join(",")}`);

                        let crawlResults: CrawlResult[] = [];

                        // Crawl each configured platform
                        for (const platform of job.platforms) {
                                if (platform === "xiaohongshu" && tikhubToken) {
                                        const xhsResults = await crawlXiaohongshu(job.keywords, tikhubToken);
                                        crawlResults.push(...xhsResults);
                                } else if (platform === "reddit") {
                                        const redditResults = await crawlReddit(job.keywords);
                                        crawlResults.push(...redditResults);
                                }
                                // Add more platforms here: twitter, douyin, etc.
                        }

                        console.log(`[Scheduler] Job ${job.id} collected ${crawlResults.length} raw signals`);

                        // 2. Insert signals with deduplication
                        let insertedCount = 0;
                        for (const result of crawlResults) {
                                if (!result.content || result.content.length < 10) continue;

                                const contentHash = await hashContent(result.content);

                                const { error: insertError } = await supabase
                                        .from("raw_market_signals")
                                        .upsert({
                                                content: result.content,
                                                source: result.source,
                                                source_id: result.source_id,
                                                source_url: result.source_url,
                                                content_type: result.content_type,
                                                author_name: result.author_name,
                                                likes_count: result.likes_count || 0,
                                                comments_count: result.comments_count || 0,
                                                content_hash: contentHash,
                                                scanned_at: new Date().toISOString()
                                        }, { onConflict: "content_hash", ignoreDuplicates: true });

                                if (!insertError) {
                                        insertedCount++;
                                }
                        }

                        totalSignals += insertedCount;
                        processedJobs.push(job.id);

                        // 3. Update job status
                        const nextRun = new Date();
                        if (job.frequency === "hourly") {
                                nextRun.setHours(nextRun.getHours() + 1);
                        } else if (job.frequency === "daily") {
                                nextRun.setDate(nextRun.getDate() + 1);
                        } else {
                                nextRun.setDate(nextRun.getDate() + 7);
                        }

                        await supabase
                                .from("scan_jobs")
                                .update({
                                        last_run_at: new Date().toISOString(),
                                        next_run_at: nextRun.toISOString(),
                                        signals_found: (job as any).signals_found + insertedCount
                                })
                                .eq("id", job.id);
                }

                return new Response(
                        JSON.stringify({
                                success: true,
                                jobs_processed: processedJobs.length,
                                signals_collected: totalSignals,
                                processed_job_ids: processedJobs
                        }),
                        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );

	} catch (error) {
		console.error("[Scheduler] Fatal error:", error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		return new Response(
			JSON.stringify({ error: message }),
			{ headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
		);
        }
});
