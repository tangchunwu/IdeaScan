import type { OpportunityEvidence, OpportunityRequest } from './opportunity-types.ts';
export interface ResearchReader {
  from(table: string): {select(columns: string): {eq(column: string, value: string): {eq(column: string, value: string): {maybeSingle(): PromiseLike<{data: unknown;error: unknown}>}}}};
}
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0,max) : '';
/** 由服务端依据归属载入；不接受前端提交的任意“证据”。 */
export async function loadResearchHandoff(client: ResearchReader, userId: string, sessionId: string, candidateId: string): Promise<{evidence:OpportunityEvidence[];request:OpportunityRequest}> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId) || !/^[\w-]{1,100}$/.test(candidateId)) throw new Error('研究引用格式不正确');
  const {data,error}=await client.from('research_sessions').select('result').eq('id',sessionId).eq('user_id',userId).maybeSingle();
  if(error || !data) throw new Error('研究记录不可用，请检查账号或重新保存研究');
  const result=record(record(data).result);
  const candidate=(Array.isArray(result.candidates)?result.candidates:[]).map(record).find(c=>c.id===candidateId);
  if(!candidate) throw new Error('研究候选不存在');
  const evidence:OpportunityEvidence[]=[];
  const seen=new Set<string>();
  for(const raw of (Array.isArray(candidate.evidence)?candidate.evidence:[]).slice(0,60)) {
    const e=record(raw); const id=clean(e.id,100); const snippet=clean(e.snippet,4000);
    let url:URL; try {url=new URL(clean(e.url,4096));} catch {continue;}
    if(url.protocol!=='https:' || url.username || url.password || !id || !snippet || seen.has(id)) continue;
    seen.add(id);
    evidence.push({id,platform:clean(e.platform,40),title:clean(e.title,180),snippet,url:url.href,collectedAt:clean(e.collectedAt,50),kind:'fact'});
  }
  const req=record(result.request);
  const request={country:clean(req.country,80),industry:clean(req.industry,100),keyword:clean(req.keyword,200),platforms:Array.isArray(req.platforms)?req.platforms:[],mode:req.mode==='deep'?'deep':'quick',language:clean(req.language,20)||undefined,countryCode:clean(req.countryCode,2)||undefined,opportunityType:clean(req.opportunityType,30)||undefined} as OpportunityRequest;
  return {evidence,request};
}
