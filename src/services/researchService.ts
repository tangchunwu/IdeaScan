import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { OpportunityResult } from '@/types/opportunity';
import { parseOpportunityResult, serializeOpportunityResult } from '@/lib/opportunityRadar';

export interface ResearchOutcome {stage:'interview'|'quote'|'trial'|'repeat_use'|'purchase';note:string;recordedAt:string;source:'self_reported'}
export interface ResearchSession {id:string;createdAt:string;result:OpportunityResult;outcomes:Record<string,ResearchOutcome[]>}
async function assertIdentity(ownerId:string) {
  const {data:{user},error}=await supabase.auth.getUser();
  if(error || !user || user.id!==ownerId) throw new Error('登录身份已变化，请重新打开研究记录');
}
function parseOutcomes(value:Json):Record<string,ResearchOutcome[]> {
  if(!value || typeof value!=='object' || Array.isArray(value)) return {};
  const results:Record<string,ResearchOutcome[]>={};
  for(const [id,items] of Object.entries(value)) {
    if(!Array.isArray(items)) continue;
    results[id]=items.filter((item):item is Json & ResearchOutcome=>!!item&&typeof item==='object'&&!Array.isArray(item)&&'source' in item&&item.source==='self_reported'&&'stage' in item&&['interview','quote','trial','repeat_use','purchase'].includes(String(item.stage))).slice(-20).map(item=>({stage:item.stage,note:String(item.note||'').slice(0,1000),recordedAt:String(item.recordedAt||''),source:'self_reported'}));
  }
  return results;
}
export async function saveResearchSession(result:OpportunityResult,ownerId:string):Promise<string> {
  await assertIdentity(ownerId);
  const snapshot=JSON.parse(serializeOpportunityResult(result)) as Json;
  const {data,error}=await supabase.from('research_sessions').insert({user_id:ownerId,result:snapshot}).select('id').single();
  if(error || !data) throw new Error('研究保存失败；请确认研究存储服务已部署，再重试保存');
  await assertIdentity(ownerId);
  return data.id;
}
export async function listResearchSessions(ownerId:string):Promise<ResearchSession[]> {
  await assertIdentity(ownerId);
  const {data,error}=await supabase.from('research_sessions').select('id,result,outcomes,created_at').eq('user_id',ownerId).order('created_at',{ascending:false}).limit(20);
  if(error) throw new Error('暂时无法读取已保存研究，请确认研究存储服务已部署');
  await assertIdentity(ownerId);
  return (data||[]).flatMap(row=>{try{return [{id:row.id,createdAt:row.created_at,result:parseOpportunityResult(row.result),outcomes:parseOutcomes(row.outcomes)}]}catch{return []}});
}
export async function recordResearchOutcome(sessionId:string,candidateId:string,stage:ResearchOutcome['stage'],note:string,ownerId:string):Promise<void> {
  await assertIdentity(ownerId);
  if(!note.trim()) throw new Error('请填写实际观察或结果');
  const {data,error}=await supabase.from('research_sessions').select('result,outcomes').eq('id',sessionId).eq('user_id',ownerId).single();
  if(error || !data) throw new Error('研究记录不可用');
  const result=parseOpportunityResult(data.result);
  if(!result.candidates.some(candidate=>candidate.id===candidateId)) throw new Error('候选不存在');
  const outcomes=parseOutcomes(data.outcomes);
  outcomes[candidateId]=[...(outcomes[candidateId]||[]),{stage,note:note.trim().slice(0,1000),recordedAt:new Date().toISOString(),source:'self_reported' as const}].slice(-20);
  await assertIdentity(ownerId);
  const updated=await supabase.from('research_sessions').update({outcomes:outcomes as unknown as Json,updated_at:new Date().toISOString()}).eq('id',sessionId).eq('user_id',ownerId).eq('outcomes',JSON.stringify(data.outcomes)).select('id');
  if(updated.error || !updated.data?.length) throw new Error('结果保存失败或记录已更新，请刷新研究后重试');
}
