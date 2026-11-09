import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolvePool } from "../_shared/config-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-digest-secret",
};

type Signal = {
  id: string;
  content: string;
  source: string;
  source_url: string | null;
  opportunity_score: number | null;
  pain_level: string | null;
  topic_tags: string[] | null;
  scanned_at: string;
};

type Digest = {
  title: string;
  conclusion: string;
  opportunities: Array<{ title: string; why: string; evidence_ids: string[] }>;
  watchouts: string[];
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseJson(content: string): Digest | null {
  try {
    const match = content.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.conclusion !== "string" || !Array.isArray(parsed.opportunities)) return null;
    return {
      title: typeof parsed.title === "string" ? parsed.title : "今日市场信号日报",
      conclusion: parsed.conclusion,
      opportunities: parsed.opportunities.slice(0, 5).map((item: any) => ({
        title: String(item.title || "未命名机会"),
        why: String(item.why || ""),
        evidence_ids: Array.isArray(item.evidence_ids) ? item.evidence_ids.map(String) : [],
      })),
      watchouts: Array.isArray(parsed.watchouts) ? parsed.watchouts.map(String).slice(0, 5) : [],
    };
  } catch {
    return null;
  }
}

function fallbackDigest(signals: Signal[]): Digest {
  const top = signals.slice(0, 3);
  return {
    title: "今日市场信号日报",
    conclusion: top.length
      ? `过去 24 小时新增 ${signals.length} 条市场信号。当前最值得继续核查的是评分最高的 ${Math.min(top.length, 3)} 个方向；这些是线索，不代表已经验证付费。`
      : "过去 24 小时没有新增可用市场信号。",
    opportunities: top.map((signal) => ({
      title: signal.topic_tags?.[0] || "待归类机会",
      why: signal.content.slice(0, 180),
      evidence_ids: [signal.id],
    })),
    watchouts: ["信号数量和机会评分只能作为筛选依据，仍需查看原始来源并做用户验证。"],
  };
}

async function generateDigest(signals: Signal[]): Promise<Digest> {
  const providers = await resolvePool("llm");
  const provider = providers[0];
  if (!provider) return fallbackDigest(signals);

  const evidence = signals.map((signal) => ({
    id: signal.id,
    source: signal.source,
    score: signal.opportunity_score,
    tags: signal.topic_tags,
    content: signal.content.slice(0, 1200),
    url: signal.source_url,
  }));
  const prompt = `你是 IdeaScan 的每日市场情报编辑。只根据下面的已采集信号写日报，不得补写信号中没有的事实，不得把机会评分写成收入证明。

请返回 JSON：
{"title":"不超过24字","conclusion":"2-4句，说明今天最值得关注的共同趋势、适合什么类型产品，以及证据强弱","opportunities":[{"title":"方向","why":"为什么值得继续调查","evidence_ids":["信号id"]}],"watchouts":["需要警惕的反证、数据缺口或下一步核查"]}

信号：
${JSON.stringify(evidence)}`;

  try {
    const response = await fetch(`${provider.base_url.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.api_key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: "你是严格的证据编辑，只返回有效 JSON。" },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) throw new Error(`LLM HTTP ${response.status}`);
    const data = await response.json();
    return parseJson(data.choices?.[0]?.message?.content || "") || fallbackDigest(signals);
  } catch (error) {
    console.error("[daily-digest] LLM failed, using deterministic fallback:", error);
    return fallbackDigest(signals);
  }
}

function renderHtml(digest: Digest, signals: Signal[], generatedAt: string): string {
  const evidenceById = new Map(signals.map((signal) => [signal.id, signal]));
  const opportunityHtml = digest.opportunities.map((item) => {
    const links = item.evidence_ids.map((id) => evidenceById.get(id)).filter(Boolean).map((signal) =>
      signal?.source_url
        ? `<a href="${escapeHtml(signal.source_url)}" style="color:#2563eb">查看来源（${escapeHtml(signal.source)}）</a>`
        : ""
    ).join(" · ");
    return `<li style="margin:0 0 18px"><strong>${escapeHtml(item.title)}</strong><br>${escapeHtml(item.why)}<br><span style="font-size:13px">${links}</span></li>`;
  }).join("");
  const watchouts = digest.watchouts.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<!doctype html><html lang="zh-CN"><body style="margin:0;background:#f6f8fa;color:#172033;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><main style="max-width:720px;margin:0 auto;padding:32px 20px"><section style="background:#fff;border:1px solid #e6eaf0;border-radius:16px;padding:28px"><p style="margin:0 0 8px;color:#64748b;font-size:13px">IdeaScan · 每日聚合结论</p><h1 style="margin:0 0 18px;font-size:26px">${escapeHtml(digest.title)}</h1><p style="font-size:16px;line-height:1.8">${escapeHtml(digest.conclusion)}</p><h2 style="margin:28px 0 12px;font-size:18px">值得继续核查</h2><ol style="padding-left:22px;line-height:1.7">${opportunityHtml || "<li>今天没有足够的新信号。</li>"}</ol><h2 style="margin:28px 0 12px;font-size:18px">证据边界</h2><ul style="padding-left:22px;line-height:1.7">${watchouts || "<li>暂无额外提示。</li>"}</ul><p style="margin:28px 0 0;color:#94a3b8;font-size:12px">聚合时间：${escapeHtml(generatedAt)} · 共 ${signals.length} 条信号。请打开来源核查，不要把日报当成已验证收入。</p></section></main></body></html>`;
}

async function sendEmail(subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("DAILY_DIGEST_TO_EMAIL");
  const from = Deno.env.get("DIGEST_FROM_EMAIL");
  if (!apiKey || !to || !from) throw new Error("Missing RESEND_API_KEY, DAILY_DIGEST_TO_EMAIL or DIGEST_FROM_EMAIL");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Resend HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return await response.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const expectedSecret = Deno.env.get("DAILY_DIGEST_CRON_SECRET");
  if (!expectedSecret || req.headers.get("x-digest-secret") !== expectedSecret) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const digestDate = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase.from("daily_digest_runs").select("status").eq("digest_date", digestDate).maybeSingle();
  if (existing?.status === "sent") return json({ success: true, duplicate: true, digest_date: digestDate });
  await supabase.from("daily_digest_runs").upsert({ digest_date: digestDate, status: "running", started_at: new Date().toISOString() }, { onConflict: "digest_date" });

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: signals, error } = await supabase.from("raw_market_signals")
      .select("id,content,source,source_url,opportunity_score,pain_level,topic_tags,scanned_at")
      .in("content_type", ["insight", "intelligence"])
      .gte("scanned_at", since)
      .order("opportunity_score", { ascending: false, nullsFirst: false })
      .limit(80);
    if (error) throw error;
    const rows = (signals || []) as Signal[];
    const digest = await generateDigest(rows);
    const html = renderHtml(digest, rows, new Date().toISOString());
    const email = await sendEmail(`IdeaScan 每日结论｜${digest.title}`, html);
    await supabase.from("daily_digest_runs").update({ status: "sent", finished_at: new Date().toISOString(), signal_count: rows.length, summary: digest, provider_message_id: email?.id || null }).eq("digest_date", digestDate);
    return json({ success: true, digest_date: digestDate, signal_count: rows.length, summary: digest });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("daily_digest_runs").update({ status: "failed", finished_at: new Date().toISOString(), error_message: message }).eq("digest_date", digestDate);
    console.error("[daily-digest] failed:", message);
    return json({ error: message, digest_date: digestDate }, 500);
  }
});
