import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MarketSignal {
  summary: string;
  source_url: string;
  topic_tags: string[];
  opportunity_score: number;
  pain_level: string;
  sentiment: string;
}

async function hashContent(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

async function searchWithPerplexity(keyword: string, baseUrl: string, apiKey: string): Promise<{ signals: MarketSignal[]; citations: string[] }> {
  const prompt = `搜索关于"${keyword}"的用户痛点、抱怨和未被满足的需求。
从社交媒体（小红书、Reddit、知乎、微博）、论坛、行业报告等渠道汇总。
重点关注：
1. 用户在抱怨什么？
2. 用户愿意为什么付费？
3. 现有方案有什么不足？
4. 有没有新兴的、未被充分服务的细分市场？

请返回 JSON 格式，包含 5-8 条市场信号。每条信号包含：
- summary: 痛点或需求的简洁描述（1-2句话）
- source_url: 你引用的来源URL（如果有）
- topic_tags: 2-3个话题标签
- opportunity_score: 商机评分（0-100，越高越有商业价值）
- pain_level: 痛点等级（"high"/"medium"/"low"）
- sentiment: 情感倾向（"negative"/"neutral"/"mixed"）

只返回 JSON 数组，不要其他文字。`;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "perplexity-search",
      temperature: 0.3,
      messages: [
        { role: "system", content: "你是一个市场情报分析师。你的任务是从公开网络信息中提取用户痛点和商业机会。只返回有效的 JSON 数组。" },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Perplexity API error: ${response.status}`, text);
    throw new Error(`Perplexity API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  const citations: string[] = (data as any).sources?.map((s: any) => s.url || s) ?? (data as any).citations ?? [];

  // Parse JSON from response
  let signals: MarketSignal[] = [];
  try {
    // Strip citation markers like [1], [2][3], and also ,\n[1] patterns
    const cleaned = content
      .replace(/,?\s*\[(\d+)\]\s*/g, " ")  // remove [N] with optional comma before
      .replace(/\s+/g, " ");                // normalize whitespace
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      signals = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error("Failed to parse Perplexity response as JSON:", e);
    console.log("Raw content (first 500):", content.slice(0, 500));
  }

  // Assign citation URLs to signals that lack source_url
  if (citations.length > 0) {
    signals.forEach((s, i) => {
      if (!s.source_url && citations[i]) {
        s.source_url = typeof citations[i] === "string" ? citations[i] : "";
      }
    });
  }

  return { signals, citations };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const baseUrl = Deno.env.get("PERPLEXITY_BASE_URL");
    const apiKey = Deno.env.get("PERPLEXITY_API_KEY");
    if (!baseUrl || !apiKey) {
      throw new Error("PERPLEXITY_BASE_URL or PERPLEXITY_API_KEY not configured");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Accept keywords from body or fetch from active scan_jobs
    let keywords: string[] = [];
    try {
      const body = await req.json();
      keywords = body.keywords || [];
    } catch { /* no body */ }

    if (keywords.length === 0) {
      // Fetch from active scan_jobs
      const { data: jobs } = await supabase
        .from("scan_jobs")
        .select("id, keywords")
        .eq("status", "active")
        .or(`next_run_at.is.null,next_run_at.lte.${new Date().toISOString()}`);

      if (jobs && jobs.length > 0) {
        keywords = [...new Set(jobs.flatMap((j: any) => j.keywords))];
      }
    }

    if (keywords.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No keywords to scan", signals_inserted: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[hunter-scan] Scanning ${keywords.length} keywords:`, keywords);

    // --- 配额保护：每日上限 ---
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: todayCount } = await supabase
      .from("raw_market_signals")
      .select("id", { count: "exact", head: true })
      .eq("source", "perplexity")
      .gte("scanned_at", todayStart.toISOString());

    const DAILY_LIMIT = 100;
    const dailyUsed = todayCount || 0;
    if (dailyUsed >= DAILY_LIMIT) {
      console.log(`[hunter-scan] Daily quota exhausted: ${dailyUsed}/${DAILY_LIMIT}`);
      return new Response(
        JSON.stringify({ success: true, message: `Daily quota exhausted (${dailyUsed}/${DAILY_LIMIT})`, signals_inserted: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- 24h 关键词去重 ---
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentSignals } = await supabase
      .from("raw_market_signals")
      .select("topic_tags")
      .eq("source", "perplexity")
      .gte("scanned_at", since24h);

    const recentKeywords = new Set<string>();
    for (const row of recentSignals || []) {
      for (const tag of (row as any).topic_tags || []) {
        recentKeywords.add(tag.toLowerCase());
      }
    }

    const freshKeywords = keywords.filter((kw: string) => !recentKeywords.has(kw.toLowerCase()));
    const keywordsToScan = freshKeywords.length > 0 ? freshKeywords : keywords;
    console.log(`[hunter-scan] After dedup: ${freshKeywords.length}/${keywords.length} fresh, scanning ${Math.min(keywordsToScan.length, 5)}`);

    let totalInserted = 0;
    const errors: string[] = [];

    for (const keyword of keywordsToScan.slice(0, 5)) {
      try {
        const { signals, citations } = await searchWithPerplexity(keyword, baseUrl, apiKey);
        console.log(`[hunter-scan] "${keyword}": got ${signals.length} signals, ${citations.length} citations`);

        // Batch prepare all records
        const records = [];
        for (const signal of signals) {
          if (!signal.summary || signal.summary.length < 10) continue;
          const contentHash = await hashContent(signal.summary);
          records.push({
            content: signal.summary,
            source: "perplexity",
            source_url: signal.source_url || null,
            content_type: "intelligence",
            author_name: null,
            likes_count: 0,
            comments_count: 0,
            content_hash: contentHash,
            topic_tags: signal.topic_tags || [],
            pain_level: signal.pain_level || null,
            opportunity_score: Math.min(100, Math.max(0, signal.opportunity_score || 0)),
            sentiment_score: signal.sentiment === "negative" ? -0.5 : signal.sentiment === "mixed" ? 0 : 0.3,
            scanned_at: new Date().toISOString(),
          });
        }

        if (records.length > 0) {
          console.log(`[hunter-scan] Attempting batch insert of ${records.length} records...`);
          console.log(`[hunter-scan] First record content_hash: ${records[0].content_hash}`);
          
          const { data: inserted, error: insertError } = await supabase
            .from("raw_market_signals")
            .insert(records)
            .select("id");

          if (insertError) {
            console.error(`[hunter-scan] Batch insert error: ${insertError.message} (code: ${insertError.code}, details: ${insertError.details})`);
          } else {
            totalInserted += inserted?.length || 0;
            console.log(`[hunter-scan] ✅ Inserted ${inserted?.length || 0} signals for "${keyword}"`);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[hunter-scan] Error for "${keyword}":`, msg);
        errors.push(`${keyword}: ${msg}`);
      }
    }

    // Update scan_jobs last_run_at
    const { data: activeJobs } = await supabase
      .from("scan_jobs")
      .select("id, frequency, signals_found")
      .eq("status", "active");

    if (activeJobs) {
      for (const job of activeJobs) {
        const nextRun = new Date();
        if ((job as any).frequency === "hourly") nextRun.setHours(nextRun.getHours() + 1);
        else if ((job as any).frequency === "daily") nextRun.setDate(nextRun.getDate() + 1);
        else nextRun.setDate(nextRun.getDate() + 7);

        await supabase.from("scan_jobs").update({
          last_run_at: new Date().toISOString(),
          next_run_at: nextRun.toISOString(),
          signals_found: ((job as any).signals_found || 0) + totalInserted,
        }).eq("id", (job as any).id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        keywords_scanned: Math.min(keywords.length, 5),
        signals_inserted: totalInserted,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[hunter-scan] Fatal error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
