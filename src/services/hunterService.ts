import { supabase } from "@/integrations/supabase/client";

// Define types locally since these tables may not be in generated types yet
export interface RawMarketSignal {
	id: string;
	content: string;
	source: string;
	source_id?: string;
	source_url?: string;
	content_type: string;
	author_name?: string;
	likes_count: number;
	comments_count: number;
	content_hash?: string;
	sentiment_score?: number;
	opportunity_score?: number;
	topic_tags?: string[];
	pain_level?: string;
	scanned_at: string;
	processed_at?: string;
	parent_signal_id?: string;
}

export interface NicheOpportunity {
	id: string;
	keyword: string;
	title: string;
	description: string;
	category?: string;
	urgency_score: number;
	signal_count: number;
	avg_opportunity_score: number;
	top_sources: string[];
	market_size_est?: string;
	discovered_at: string;
	created_at: string;
	updated_at: string;
}

export interface ScanJob {
	id: string;
	keywords: string[];
	platforms: string[];
	status: 'active' | 'paused';
	frequency: string;
	last_run_at?: string;
	next_run_at?: string;
	signals_found: number;
	created_by: string;
	created_at: string;
}

// Type-safe wrapper for tables not in generated types
const fromTable = (table: string) => supabase.from(table as any);

export const hunterService = {
	// === Scan Jobs ===

	async getScanJobs(): Promise<ScanJob[]> {
		const { data, error } = await fromTable("scan_jobs")
			.select("*")
			.order("created_at", { ascending: false });

		if (error) throw error;
		return (data || []) as unknown as ScanJob[];
	},

	async createScanJob(keywords: string[], platforms: string[] = ["xiaohongshu", "reddit"], description?: string): Promise<ScanJob> {
		const { data: { user } } = await supabase.auth.getUser();
		if (!user) throw new Error("User must be logged in to create scan jobs");

		const { data, error } = await fromTable("scan_jobs")
			.insert({
				keywords,
				platforms,
				status: "active",
				created_by: user.id
			})
			.select()
			.single();

		if (error) throw error;

		// If description provided, trigger an immediate scan with it
		if (description) {
			try {
				await supabase.functions.invoke("hunter-scan", {
					body: { keywords, description }
				});
			} catch (e) {
				console.warn("Auto-scan after job creation failed:", e);
			}
		}

		return data as unknown as ScanJob;
	},

	async toggleScanJob(id: string, status: "active" | "paused"): Promise<void> {
		const { error } = await fromTable("scan_jobs")
			.update({ status })
			.eq("id", id);

		if (error) throw error;
	},

	async deleteScanJob(id: string): Promise<void> {
		const { error } = await fromTable("scan_jobs")
			.delete()
			.eq("id", id);

		if (error) throw error;
	},

	async triggerCrawler() {
		// Trigger the Perplexity-powered hunter scan
		const { data, error } = await supabase.functions.invoke("hunter-scan");
		if (error) throw error;
		return data;
	},

	async triggerHunterScan(keywords?: string[], mode?: "discover") {
		const { data, error } = await supabase.functions.invoke("hunter-scan", {
			body: { ...(keywords ? { keywords } : {}), ...(mode ? { mode } : {}) }
		});
		if (error) throw error;
		return data;
	},

	// === Market Signals ===

	async getRecentSignals(limit = 50): Promise<RawMarketSignal[]> {
		const { data, error } = await fromTable("raw_market_signals")
			.select("*")
			.in("content_type", ["insight", "intelligence"])
			.order("scanned_at", { ascending: false })
			.limit(limit);

		if (error) throw error;
		return (data || []) as unknown as RawMarketSignal[];
	},

	async getHighOpportunitySignals(limit = 20): Promise<RawMarketSignal[]> {
		const { data, error } = await fromTable("raw_market_signals")
			.select("*")
			.in("content_type", ["insight", "intelligence"])
			.gte("opportunity_score", 70)
			.order("opportunity_score", { ascending: false })
			.limit(limit);

		if (error) throw error;
		return (data || []) as unknown as RawMarketSignal[];
	},

	async triggerAIProcessor() {
		// Manually trigger the edge function
		const { data, error } = await supabase.functions.invoke("signal-processor");
		if (error) throw error;
		return data;
	},

	// === Niche Opportunities ===

	async getOpportunities(): Promise<NicheOpportunity[]> {
		const { data, error } = await fromTable("niche_opportunities")
			.select("*")
			.order("urgency_score", { ascending: false });

		if (error) throw error;
		return (data || []) as unknown as NicheOpportunity[];
	},

	// === Admin Stats ===

	async getSignalStats(): Promise<{ total: number; insights: number; highScore: number; citations: number }> {
		const { count: total } = await fromTable("raw_market_signals")
			.select("*", { count: "exact", head: true });

		const { count: insights } = await fromTable("raw_market_signals")
			.select("*", { count: "exact", head: true })
			.in("content_type", ["insight", "intelligence"]);

		const { count: highScore } = await fromTable("raw_market_signals")
			.select("*", { count: "exact", head: true })
			.gte("opportunity_score", 70);

		const { count: citations } = await fromTable("raw_market_signals")
			.select("*", { count: "exact", head: true })
			.not("source_url", "is", null);

		return {
			total: total || 0,
			insights: insights || 0,
			highScore: highScore || 0,
			citations: citations || 0,
		};
	},

	async getRecentSignalsForAdmin(limit = 20): Promise<RawMarketSignal[]> {
		const { data, error } = await fromTable("raw_market_signals")
			.select("*")
			.order("scanned_at", { ascending: false })
			.limit(limit);

		if (error) throw error;
		return (data || []) as unknown as RawMarketSignal[];
	},

	// === Scheduler Config ===

	async getSchedulerConfig(): Promise<{ enabled: boolean; interval_minutes: number; last_toggled_at: string | null }> {
		const { data, error } = await fromTable("scheduler_config")
			.select("*")
			.eq("id", "hunter_scheduler")
			.single();

		if (error) throw error;
		return data as any;
	},

	async toggleScheduler(enabled: boolean): Promise<void> {
		const { data: { user } } = await supabase.auth.getUser();
		if (!user) throw new Error("Must be logged in");

		const { error } = await fromTable("scheduler_config")
			.update({
				enabled,
				last_toggled_at: new Date().toISOString(),
				toggled_by: user.id,
			})
			.eq("id", "hunter_scheduler");

		if (error) throw error;
	},

	async getLastCronRun(): Promise<{ lastRunAt: string | null; insightsToday: number; lastKeyword: string | null }> {
		// Get the most recent perplexity insight
		const { data: latest } = await fromTable("raw_market_signals")
			.select("scanned_at, topic_tags")
			.eq("source", "perplexity")
			.eq("content_type", "insight")
			.order("scanned_at", { ascending: false })
			.limit(1);

		// Get today's insight count
		const todayStart = new Date();
		todayStart.setHours(0, 0, 0, 0);
		const { count } = await fromTable("raw_market_signals")
			.select("id", { count: "exact", head: true })
			.eq("source", "perplexity")
			.eq("content_type", "insight")
			.gte("scanned_at", todayStart.toISOString());

		const latestRow = (latest as any)?.[0];
		return {
			lastRunAt: latestRow?.scanned_at || null,
			insightsToday: count || 0,
			lastKeyword: latestRow?.topic_tags?.[0] || null,
		};
	},

	async getSignalsByKeyword(keyword: string, limit = 3): Promise<RawMarketSignal[]> {
		const { data, error } = await fromTable("raw_market_signals")
			.select("*")
			.in("content_type", ["insight", "intelligence"])
			.contains("topic_tags", [keyword])
			.order("opportunity_score", { ascending: false })
			.limit(limit);

		if (error) throw error;
		return (data || []) as unknown as RawMarketSignal[];
	},

	async getOpportunityStats(): Promise<{ totalOpps: number; totalSignals: number; avgUrgency: number; categories: number }> {
		const { data: opps } = await fromTable("niche_opportunities").select("urgency_score, category");
		const { count: totalSignals } = await fromTable("raw_market_signals")
			.select("*", { count: "exact", head: true })
			.in("content_type", ["insight", "intelligence"]);

		const oppList = (opps || []) as unknown as { urgency_score: number; category: string | null }[];
		const categories = new Set(oppList.map(o => o.category).filter(Boolean));
		const avgUrgency = oppList.length > 0
			? Math.round(oppList.reduce((sum, o) => sum + (o.urgency_score || 0), 0) / oppList.length)
			: 0;

		return {
			totalOpps: oppList.length,
			totalSignals: totalSignals || 0,
			avgUrgency,
			categories: categories.size,
		};
	},

	async getInsightTrend7Days(): Promise<{ date: string; count: number }[]> {
		const sevenDaysAgo = new Date();
		sevenDaysAgo.setHours(0, 0, 0, 0);
		sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

		const { data, error } = await fromTable("raw_market_signals")
			.select("scanned_at")
			.eq("source", "perplexity")
			.in("content_type", ["insight", "intelligence"])
			.gte("scanned_at", sevenDaysAgo.toISOString());

		if (error) throw error;

		// Build a map of date -> count from fetched rows
		const countMap = new Map<string, number>();
		for (const row of ((data || []) as unknown as { scanned_at: string }[])) {
			const d = new Date(row.scanned_at);
			const key = `${d.getMonth() + 1}/${d.getDate()}`;
			countMap.set(key, (countMap.get(key) || 0) + 1);
		}

		// Generate 7-day series
		const results: { date: string; count: number }[] = [];
		for (let i = 6; i >= 0; i--) {
			const d = new Date();
			d.setHours(0, 0, 0, 0);
			d.setDate(d.getDate() - i);
			const key = `${d.getMonth() + 1}/${d.getDate()}`;
			results.push({ date: key, count: countMap.get(key) || 0 });
		}
		return results;
	},

	// Helper to get platform icon/color
	getPlatformInfo(source: string) {
		switch (source.toLowerCase()) {
			case "xiaohongshu":
				return { label: "小红书", color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20" };
			case "reddit":
				return { label: "Reddit", color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20" };
			case "twitter":
				return { label: "Twitter", color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20" };
			case "perplexity":
				return { label: "🌐 网络情报", color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/20" };
			default:
				return { label: source, color: "text-muted-foreground", bg: "bg-muted/10", border: "border-muted/20" };
		}
	}
};
