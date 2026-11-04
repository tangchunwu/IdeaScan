export interface ResearchVersion { versionNo: number; parentSessionId: string | null; changeSummary: string }
export function nextResearchVersion(parent?: { versionNo?: number; id?: string } | null): ResearchVersion {
  if (!parent?.id) return { versionNo:1, parentSessionId:null, changeSummary:'首次研究' };
  const current=Number.isFinite(parent.versionNo) && (parent.versionNo || 0)>0 ? Math.floor(parent.versionNo!) : 0;
  return { versionNo:current+1,parentSessionId:parent.id,changeSummary:'补充证据后的研究版本' };
}
