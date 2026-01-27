
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

export type RawMarketSignal = Database["public"]["Tables"]["raw_market_signals"]["Row"];
export type NicheOpportunity = Database["public"]["Tables"]["niche_opportunities"]["Row"];
export type ScanJob = Database["public"]["Tables"]["scan_jobs"]["Row"];

export const hunterService = {
        // === Scan Jobs ===

        async getScanJobs() {
                const { data, error } = await supabase
                        .from("scan_jobs")
                        .select("*")
                        .order("created_at", { ascending: false });

                if (error) throw error;
                return data;
        },

        async createScanJob(keywords: string[], platforms: string[] = ["xiaohongshu", "reddit"]) {
                // Check if user is logged in
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error("User must be logged in to create scan jobs");

                const { data, error } = await supabase
                        .from("scan_jobs")
                        .insert({
                                keywords,
                                platforms,
                                status: "active",
                                created_by: user.id
                        })
                        .select()
                        .single();

                if (error) throw error;
                return data;
        },

        async toggleScanJob(id: string, status: "active" | "paused") {
                const { error } = await supabase
                        .from("scan_jobs")
                        .update({ status })
                        .eq("id", id);

                if (error) throw error;
        },

        async triggerCrawler() {
                // Manually trigger the edge function
                const { data, error } = await supabase.functions.invoke("crawler-scheduler");
                if (error) throw error;
                return data;
        },

        // === Market Signals ===

        async getRecentSignals(limit = 50) {
                const { data, error } = await supabase
                        .from("raw_market_signals")
                        .select("*")
                        .order("scanned_at", { ascending: false })
                        .limit(limit);

                if (error) throw error;
                return data;
        },

        async getHighOpportunitySignals(limit = 20) {
                const { data, error } = await supabase
                        .from("raw_market_signals")
                        .select("*")
                        .gte("opportunity_score", 70)
                        .order("opportunity_score", { ascending: false })
                        .limit(limit);

                if (error) throw error;
                return data;
        },

        async triggerAIProcessor() {
                // Manually trigger the edge function
                const { data, error } = await supabase.functions.invoke("signal-processor");
                if (error) throw error;
                return data;
        },

        // === Niche Opportunities ===

        async getOpportunities() {
                const { data, error } = await supabase
                        .from("niche_opportunities")
                        .select("*")
                        .order("urgency_score", { ascending: false });

                if (error) throw error;
                return data;
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
                        default:
                                return { label: source, color: "text-gray-500", bg: "bg-gray-500/10", border: "border-gray-500/20" };
                }
        }
};
