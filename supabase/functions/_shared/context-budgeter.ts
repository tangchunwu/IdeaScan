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

function scoreNote(note: any): number {
  const likes = Number(note?.liked_count || note?.digg_count || note?.likes || 0);
  const comments = Number(note?.comments_count || note?.comment_count || 0);
  const collects = Number(note?.collected_count || note?.collect_count || 0);
  const textLen = String(note?.desc || note?.content || "").length;
  return likes + comments * 2 + collects * 1.5 + Math.min(40, textLen / 20);
}

function scoreComment(comment: any): number {
  const likes = Number(comment?.like_count || comment?.digg_count || comment?.likes || 0);
  const textLen = String(comment?.content || comment?.text || "").length;
  return likes * 2 + Math.min(30, textLen / 12);
}

function scoreCompetitor(c: any): number {
  const cleanedBonus = c?.hasCleanedContent ? 20 : 0;
  const deepBonus = String(c?.source || "").includes("Deep") ? 10 : 0;
  const textLen = String(c?.cleanedContent || c?.snippet || "").length;
  return cleanedBonus + deepBonus + Math.min(50, textLen / 20);
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

  const budgetedNotes = Array.from(dedupNoteMap.values())
    .sort((a, b) => scoreNote(b) - scoreNote(a))
    .slice(0, maxNotes);

  const budgetedComments = Array.from(dedupCommentMap.values())
    .sort((a, b) => scoreComment(b) - scoreComment(a))
    .slice(0, maxComments);

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

