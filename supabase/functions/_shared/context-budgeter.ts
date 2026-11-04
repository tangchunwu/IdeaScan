type BudgetMode = "quick" | "deep";

interface BudgetResult<TSocial = any, TCompetitor = any> {
  socialData: TSocial;
  competitorData: TCompetitor[];
  stats: {
    notes_before: number;
    notes_after: number;
    comments_before: number;
    comments_after: number;
    competitors_before: number;
    competitors_after: number;
    char_before: number;
    char_after: number;
  };
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseTimestamp(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) {
    // Handle second-based unix timestamp.
    if (input > 0 && input < 10_000_000_000) return input * 1000;
    return input;
  }
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const asNum = Number(raw);
    if (!Number.isFinite(asNum)) return null;
    if (asNum > 0 && asNum < 10_000_000_000) return asNum * 1000;
    return asNum;
  }
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

function freshnessScore(input: unknown): number {
  const ts = parseTimestamp(input);
  if (!ts) return 0;
  const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  if (ageDays <= 2) return 20;
  if (ageDays <= 7) return 14;
  if (ageDays <= 14) return 9;
  if (ageDays <= 30) return 4;
  return 0;
}

function estimateChars(socialData: any, competitors: any[]): number {
  const notesChars = (socialData?.sampleNotes || []).reduce((sum: number, note: any) => {
    return sum + String(note?.title || "").length + String(note?.desc || note?.content || "").length;
  }, 0);

  const commentsChars = (socialData?.sampleComments || []).reduce((sum: number, c: any) => {
    return sum + String(c?.content || c?.text || "").length;
  }, 0);

  const competitorChars = (competitors || []).reduce((sum: number, c: any) => {
    return sum + String(c?.title || "").length + String(c?.snippet || "").length + String(c?.cleanedContent || "").length;
  }, 0);

  return notesChars + commentsChars + competitorChars;
}

function behaviorSignalScore(value: unknown): number {
  const content = String(value || '');
  // 仅用于上下文取样优先级，不把词命中当作需求或支付已经证实。
  const concrete = /(?:\b(?:pay|paid|paying|every|weekly|monthly|manually|hours|minutes|spreadsheet|alternative|refund|cancel|wish|ritual|remind|check[ -]?in)\b|每次|每天|每周|每月|小时|花钱|付费|订阅|表格|手工|重复|纪念|许愿|报平安|立替|精算|面倒|毎日|毎月|支払|불편|매일|결제|구독)/i.test(content);
  const promotional = /(?:visit our|our shop|use my code|limited offer|限时优惠|扫码购买|优惠券|推广链接)/i.test(content);
  return (concrete ? 60 : 0) - (promotional ? 30 : 0);
}

function scoreNote(note: any): number {
  const likes = Math.max(0, Number(note?.liked_count || note?.digg_count || note?.likes || 0));
  const text = `${note?.title || ''} ${note?.desc || note?.content || ''}`;
  return behaviorSignalScore(text) + Math.min(10, Math.log2(likes + 1)) + Math.min(12, text.length / 60) + freshnessScore(note?.created_at || note?.publish_time || note?.create_time || note?.time);
}

function scoreComment(comment: any): number {
  const likes = Math.max(0, Number(comment?.like_count || comment?.digg_count || comment?.likes || 0));
  const text = String(comment?.content || comment?.text || '');
  return behaviorSignalScore(text) + Math.min(10, Math.log2(likes + 1)) + Math.min(12, text.length / 60) + freshnessScore(comment?.created_at || comment?.create_time || comment?.time);
}

function selectDiverse(items: any[], limit: number, score: (item: any) => number): any[] {
  const sorted = [...items].sort((a, b) => score(b) - score(a));
  const selected: any[] = [];
  const seenPlatforms = new Set<string>();
  // 每个平台先保留一条高优先级原文，再填剩余预算，避免单一热门渠道挤占全部上下文。
  for (const item of sorted) {
    const platform = String(item?._platform || item?.platform || 'unknown');
    if (!seenPlatforms.has(platform)) { selected.push(item); seenPlatforms.add(platform); }
    if (selected.length >= limit) return selected;
  }
  for (const item of sorted) {
    if (!selected.includes(item)) selected.push(item);
    if (selected.length >= limit) break;
  }
  return selected;
}

function scoreCompetitor(c: any): number {
  const cleanedBonus = c?.hasCleanedContent ? 20 : 0;
  const deepBonus = String(c?.source || "").includes("Deep") ? 10 : 0;
  const textLen = String(c?.cleanedContent || c?.snippet || "").length;
  const freshness = freshnessScore(c?.published_at || c?.publish_time || c?.created_at);
  return cleanedBonus + deepBonus + Math.min(50, textLen / 20) + freshness;
}

export function applyContextBudget(
  socialData: any,
  competitorData: any[],
  mode: BudgetMode = "quick"
): BudgetResult {
  const notes = Array.isArray(socialData?.sampleNotes) ? [...socialData.sampleNotes] : [];
  const comments = Array.isArray(socialData?.sampleComments) ? [...socialData.sampleComments] : [];
  const competitors = Array.isArray(competitorData) ? [...competitorData] : [];

  const maxNotes = mode === "deep" ? 12 : 6;
  const maxComments = mode === "deep" ? 24 : 12;
  const maxCompetitors = mode === "deep" ? 14 : 8;

  const dedupNoteMap = new Map<string, any>();
  for (const n of notes) {
    const key = normalizeText(`${n?.title || ""}|${String(n?.desc || n?.content || "").slice(0, 160)}`);
    if (!dedupNoteMap.has(key)) dedupNoteMap.set(key, n);
  }

  const dedupCommentMap = new Map<string, any>();
  for (const c of comments) {
    const content = String(c?.content || c?.text || "").trim();
    if (!content || content.length < 6) continue;
    const key = normalizeText(content.slice(0, 180));
    if (!dedupCommentMap.has(key)) dedupCommentMap.set(key, c);
  }

  const dedupCompetitorMap = new Map<string, any>();
  for (const c of competitors) {
    const key = normalizeText(`${c?.url || ""}|${c?.title || ""}|${String(c?.snippet || "").slice(0, 120)}`);
    if (!dedupCompetitorMap.has(key)) dedupCompetitorMap.set(key, c);
  }

  const budgetedNotes = selectDiverse(Array.from(dedupNoteMap.values()), maxNotes, scoreNote);

  const budgetedComments = selectDiverse(Array.from(dedupCommentMap.values()), maxComments, scoreComment);

  const budgetedCompetitors = Array.from(dedupCompetitorMap.values())
    .sort((a, b) => scoreCompetitor(b) - scoreCompetitor(a))
    .slice(0, maxCompetitors);

  const socialBudgeted = {
    ...socialData,
    sampleNotes: budgetedNotes,
    sampleComments: budgetedComments,
    totalNotes: Number(socialData?.totalNotes || 0),
  };

  return {
    socialData: socialBudgeted,
    competitorData: budgetedCompetitors,
    stats: {
      notes_before: notes.length,
      notes_after: budgetedNotes.length,
      comments_before: comments.length,
      comments_after: budgetedComments.length,
      competitors_before: competitors.length,
      competitors_after: budgetedCompetitors.length,
      char_before: estimateChars(socialData, competitors),
      char_after: estimateChars(socialBudgeted, budgetedCompetitors),
    },
  };
}
