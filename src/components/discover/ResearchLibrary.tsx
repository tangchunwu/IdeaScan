import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/shared/GlassCard';
import { listResearchSessions, recordResearchOutcome, saveResearchSession, type ResearchOutcome, type ResearchSession } from '@/services/researchService';
import type { OpportunityResult } from '@/types/opportunity';

export function ResearchLibrary({ownerId,result,sessionId,onSaved,onRestore}:{ownerId:string;result:OpportunityResult|null;sessionId:string|null;onSaved:(id:string)=>void;onRestore:(record:ResearchSession)=>void}) {
  const [records,setRecords]=useState<ResearchSession[]>([]);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const generation=useRef(0);
  useLayoutEffect(()=>{
    const current=++generation.current; setRecords([]); setError('');setBusy(false);
    void listResearchSessions(ownerId).then(rows=>{if(generation.current===current)setRecords(rows)}).catch(()=>{if(generation.current===current)setError('研究库暂不可用；本次结果仍可查看与导出，请稍后重试保存。')});
    return ()=>{generation.current=current+1};
  },[ownerId,sessionId,result]);
  async function save() {
    if(!result || busy)return; const current=generation.current;setBusy(true);setError('');
    try {const id=await saveResearchSession(result,ownerId);if(current===generation.current)onSaved(id)}
    catch {if(current===generation.current)setError('保存失败，请稍后重试；当前结果尚未保存。')}
    finally {if(current===generation.current)setBusy(false)}
  }
  const isNewVersion=Boolean(result?.request.parentResearchId && sessionId);
  return <GlassCard className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">我的研究档案</h3>{result&&<Button type="button" variant="outline" disabled={busy||(!isNewVersion&&!!sessionId)} onClick={save}>{isNewVersion?'保存补证版本':sessionId?'本次研究已保存':busy?'保存中…':'保存本次研究'}</Button>}</div>
    {error&&<p role="status" className="text-sm text-muted-foreground">{error}</p>}
    {records.length>0?<ul className="space-y-2">{records.map(row=><li key={row.id}><button type="button" className="w-full rounded-lg border p-3 text-left text-sm hover:bg-muted" onClick={()=>onRestore(row)}>{row.result.request.country} · {row.result.request.industry||row.result.request.keyword||'场景研究'}<span className="block text-xs text-muted-foreground">第 {row.versionNo} 版 · {row.changeSummary} · {new Date(row.createdAt).toLocaleString('zh-CN')} · {row.result.candidates.length} 个候选</span></button></li>)}</ul>:!error&&<p className="text-sm text-muted-foreground">保存研究后，可在这里继续查看原文、比较候选和记录验证结果。</p>}
  </GlassCard>;
}

const OUTCOME_LABELS={interview:'访谈',quote:'报价',trial:'试用',repeat_use:'复用',purchase:'购买反馈'};
const EMPTY_OUTCOMES:ResearchOutcome[]=[];
export function ResearchOutcomeEditor({ownerId,sessionId,candidateId,initialOutcomes=EMPTY_OUTCOMES}:{ownerId:string;sessionId:string;candidateId:string;initialOutcomes?:ResearchOutcome[]}) {
  const [stage,setStage]=useState<ResearchOutcome['stage']>('interview');const [note,setNote]=useState('');const [status,setStatus]=useState('');const [busy,setBusy]=useState(false);
  const generation=useRef(0);
  const [history,setHistory]=useState(initialOutcomes);
  useEffect(()=>{const current=++generation.current;setNote('');setStatus('');setBusy(false);setHistory(initialOutcomes);return()=>{generation.current=current+1}},[ownerId,sessionId,candidateId,initialOutcomes]);
  async function save() {const current=generation.current;setBusy(true);setStatus('');try{await recordResearchOutcome(sessionId,candidateId,stage,note,ownerId);if(current===generation.current){setStatus('结果已记录（本人提供，尚未独立核实）');setHistory(items=>[...items,{stage,note:note.trim(),source:'self_reported' as const,recordedAt:new Date().toISOString()}].slice(-20));setNote('')}}catch{if(current===generation.current)setStatus('记录失败，请刷新研究后重试')}finally{if(current===generation.current)setBusy(false)}}
  return <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">记录实际验证结果</summary><div className="mt-3 space-y-3">
    {!!history.length&&<ul className="space-y-2 text-sm">{history.map((item,index)=><li key={index} className="rounded border p-2"><p>{item.note}</p><p className="text-xs text-muted-foreground">{OUTCOME_LABELS[item.stage]} · {new Date(item.recordedAt).toLocaleString('zh-CN')} · 本人记录，未独立核实</p></li>)}</ul>}
    <label className="block text-sm">验证阶段<select aria-label="验证结果阶段" value={stage} onChange={e=>setStage(e.target.value as ResearchOutcome['stage'])} className="ml-2 rounded-md border bg-background p-2">{[['interview','访谈'],['quote','报价'],['trial','试用'],['repeat_use','复用'],['purchase','购买反馈']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
    <textarea aria-label="实际验证结果" value={note} maxLength={1000} onChange={e=>setNote(e.target.value)} className="min-h-20 w-full rounded-md border bg-background p-2 text-sm" placeholder="记录对象、实际行为、日期和结果。避免写入个人隐私。" />
    <Button type="button" variant="outline" disabled={busy||!note.trim()} onClick={save}>{busy?'记录中…':'保存观察结果'}</Button>
    <p className="text-xs text-muted-foreground">本人记录会保留来源标记；购买反馈不直接视为系统已核验支付。</p>{status&&<p role="status" className="text-sm">{status}</p>}
  </div></details>;
}
