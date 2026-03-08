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
			.eq("content_type", "source_citation");

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
