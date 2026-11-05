import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Download, Globe2, Radar, Settings2, ShieldCheck, X } from 'lucide-react';
import { Navbar, PageBackground, GlassCard, SettingsDialog } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { useSkinToast } from '@/hooks/useSkinToast';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { supabase } from '@/integrations/supabase/client';
import { discoverOpportunities, getOpportunityConfigIssues, OpportunityRadarError, serializeOpportunityResult } from '@/lib/opportunityRadar';
import { getOpportunityValidationUrl } from '@/lib/validateRoute';
import { RADAR_PLATFORMS, type OpportunityRequest, type OpportunityResult, type RadarPlatform } from '@/types/opportunity';
import './OpportunityRadar.css';
import { ResearchLibrary, ResearchOutcomeEditor } from '@/components/discover/ResearchLibrary';
import { saveResearchSession, type ResearchOutcome } from '@/services/researchService';
import { deriveEvidenceGaps } from '@/lib/researchGaps';

const platformNames: Record<RadarPlatform, string> = {
  xiaohongshu: '小红书', douyin: '抖音', tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', reddit: 'Reddit', twitter: 'X / Twitter', threads: 'Threads',
};
const countries = ['United States', 'China', 'United Kingdom', 'Canada', 'Australia', 'Singapore', 'Japan', 'South Korea', 'Germany', 'France', 'India', 'Indonesia', 'Brazil', 'Mexico', 'United Arab Emirates'];
const urgencyNames = { high: '高', medium: '中', low: '低' };
const valueModelNames = { utility: '工具价值', entertainment: '娱乐价值' } as const;

function safeSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function CollectedTime({ value }: { value: string }) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? <span>采集时间未提供</span>
    : <time dateTime={value}>{date.toLocaleString('zh-CN', { hour12: false })}</time>;
}

export default function OpportunityRadar() {
  useDocumentTitle('商机雷达', { description: '按国家与行业检索真实公开线索，从原文证据中寻找待验证的商业机会。' });
  const { user, isLoading: authLoading } = useAuth();
  const settings = useSettings();
  const toast = useSkinToast();
  const location = useLocation();
  const navigate = useNavigate();
  const userId = user?.id ?? null;
  const [identity, setIdentity] = useState(userId);
  const activeIdentity = useRef(userId);
  const generation = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const [form, setForm] = useState<OpportunityRequest>({ country: 'United States', industry: '', keyword: '', platforms: [], mode: 'quick' });
  const [stored, setStored] = useState<{ ownerId: string; result: OpportunityResult } | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessionId,setSessionId]=useState<string|null>(null);
  const [selectedCandidates,setSelectedCandidates]=useState<string[]>([]);
  const [savingHandoff,setSavingHandoff]=useState(false);
  const [outcomes,setOutcomes]=useState<Record<string,ResearchOutcome[]>>({});
  const authorized = !!userId && identity === userId && !authLoading;
  // 渲染时也核对归属，不能等 effect 清理后才隐藏旧账号数据。
  const result = authorized && stored?.ownerId === userId ? stored.result : null;
  const loginUrl = `/auth?redirect=${encodeURIComponent(location.pathname + location.search)}`;
  const configIssues = getOpportunityConfigIssues(settings, form);

  useLayoutEffect(() => {
    activeIdentity.current = userId;
    generation.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    setIdentity(userId);
    setStored(null);
    setForm({ country: 'United States', industry: '', keyword: '', platforms: [], mode: 'quick' });
    setLoading(false);
    setNotice('');
    setError('');
    setNeedsLogin(false);
    setSettingsOpen(false);
    setSessionId(null);setSelectedCandidates([]);setSavingHandoff(false);setOutcomes({});
  }, [userId]);

  useEffect(() => {
    // AuthProvider 可能先验证新身份再更新 context；原始事件先封住旧结果。
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextId = session?.user.id ?? null;
      if (nextId === activeIdentity.current) return;
      activeIdentity.current = nextId;
      generation.current += 1;
      activeController.current?.abort();
      activeController.current = null;
      setIdentity(nextId);
      setStored(null);
      setForm({ country: 'United States', industry: '', keyword: '', platforms: [], mode: 'quick' });
      setLoading(false);
      setNotice('');
      setError('');
      setNeedsLogin(false);
      setSettingsOpen(false);
      setSessionId(null);setSelectedCandidates([]);setSavingHandoff(false);setOutcomes({});
    });
    return () => {
      generation.current += 1;
      activeController.current?.abort();
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authorized || activeIdentity.current !== userId || activeController.current) return;
    const request: OpportunityRequest = {
      ...form, country: form.country.trim(), industry: form.industry.trim(), keyword: form.keyword?.trim(), platforms: [...form.platforms],
    };
    const ownerId = userId;
    const currentGeneration = ++generation.current;
    const controller = new AbortController();
    activeController.current = controller;
    setLoading(true);
    setStored(null);
    setSessionId(null);setSelectedCandidates([]);setSavingHandoff(false);setOutcomes({});
    setError('');
    setNotice('');
    setNeedsLogin(false);
    const isCurrent = () => generation.current === currentGeneration && !controller.signal.aborted && activeIdentity.current === ownerId;
    try {
      const data = await discoverOpportunities(request, settings, { signal: controller.signal, expectedUserId: ownerId });
      if (!isCurrent()) return;
      setStored({ ownerId, result: data });
      setNotice(data.candidates.length ? `发现完成，返回 ${data.candidates.length} 条待验证假设。` : '发现完成，当前证据不足以形成候选商机。');
    } catch (cause) {
      if (!isCurrent()) return;
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        setNotice('会话或请求已变化，已停止等待；已发出的上游请求仍可能计费。');
      } else {
        const message = cause instanceof OpportunityRadarError ? cause.message : '发现失败，请稍后重试。';
        setError(message);
        setNeedsLogin(cause instanceof OpportunityRadarError && cause.code === 'auth');
        toast.error(message);
      }
    } finally {
      if (isCurrent()) { activeController.current = null; setLoading(false); }
    }
  }

  function cancel() {
    generation.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    setLoading(false);
    setSavingHandoff(false);
    setNotice('已取消等待。已发出的请求可能仍在服务端执行并产生费用，取消不保证停止计费。');
  }

  function exportResult() {
    if (!result || activeIdentity.current !== userId) return;
    let url: string | undefined;
    try {
      url = URL.createObjectURL(new Blob([serializeOpportunityResult(result)], { type: 'application/json;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'opportunity-radar-result.json';
      link.click();
      toast.success('已导出结果，不含 API 配置。');
    } catch { toast.error('导出失败，请稍后重试。'); }
    finally { if (url) URL.revokeObjectURL(url); }
  }

  async function enterValidation(candidate:OpportunityResult['candidates'][number]) {
    if(!result || !userId || activeIdentity.current!==userId || savingHandoff)return;
    const ownerId=userId;const current=generation.current;setSavingHandoff(true);
    try {
      const savedId=sessionId || await saveResearchSession(result,ownerId);
      if(activeIdentity.current!==ownerId || generation.current!==current)return;
      setSessionId(savedId);
      const url=getOpportunityValidationUrl({title:candidate.title,problem:candidate.problem,targetUsers:candidate.targetUsers,country:result.request.country,industry:result.request.industry,platforms:result.request.platforms,opportunityType:result.request.opportunityType,valueModel:result.request.valueModel});
      const params=new URLSearchParams(url.split('?')[1]);params.set('researchSessionId',savedId);params.set('researchCandidateId',candidate.id);
      if(result.request.language)params.set('language',result.request.language);
      navigate(`/validate?${params}`);
    } catch {if(activeIdentity.current===ownerId&&generation.current===current)toast.error('保存未成功，证据尚未交接；请稍后重试或先导出结果。')}
    finally {if(activeIdentity.current===ownerId&&generation.current===current)setSavingHandoff(false)}
  }

  return (
    <PageBackground className="opportunity-radar" showClouds={false}>
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-28 section-breathe sm:px-6 sm:pt-32">
        <header className="mb-8 max-w-2xl space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Radar aria-hidden="true" className="h-5 w-5" /> 从线索到假设</div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">商机雷达</h1>
          <p className="text-muted-foreground leading-relaxed">选一个市场，寻找值得验证的问题。只呈现实际采集的线索，不把讨论热度当作付费需求。</p>
        </header>

        <div className="radar-workspace">
          <section aria-labelledby="radar-form-title" className="min-w-0">
            <GlassCard className="radar-form-card" padding="none">
              <form onSubmit={handleSubmit} className="space-y-6 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="radar-form-title" className="text-xl font-semibold">设定发现范围</h2>
                  <Button type="button" variant="ghost" size="icon" className="radar-touch" aria-label="打开 API 设置" onClick={() => setSettingsOpen(true)}><Settings2 aria-hidden="true" /></Button>
                </div>
                <fieldset disabled={loading} className="min-w-0 space-y-5">
                  <legend className="sr-only">检索条件</legend>
                  <div className="space-y-2">
                    <label htmlFor="radar-country" className="text-sm font-medium">国家 / 地区</label>
                    <Input id="radar-country" list="radar-countries" value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} required maxLength={80} aria-describedby="radar-country-help" />
                    <datalist id="radar-countries">{countries.map(country => <option key={country} value={country} />)}</datalist>
                    <p id="radar-country-help" className="text-xs text-muted-foreground">使用可读的英文国家名，可直接输入；国家条件不等于来源所在地已核实。</p>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="radar-type" className="text-sm font-medium">想找哪类小应用</label>
                    <select id="radar-type" value={form.opportunityType||''} onChange={e=>setForm({...form,opportunityType:(e.target.value||undefined) as OpportunityRequest['opportunityType']})} className="block w-full rounded-md border bg-background p-2">{[['','不限类型'],['reassurance','安心与被关心'],['ritual','情绪与仪式'],['festival','地域节日'],['hobby','兴趣与关系'],['daily','日常小麻烦'],['workflow','工作与效率']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="radar-value-model" className="text-sm font-medium">价值类型</label>
                    <select id="radar-value-model" value={form.valueModel||''} onChange={e=>setForm({...form,valueModel:(e.target.value||undefined) as OpportunityRequest['valueModel']})} className="block w-full rounded-md border bg-background p-2"><option value="">自动判断</option><option value="utility">工具：节省时间 / 降低损失</option><option value="entertainment">娱乐：复玩 / 情绪 / 分享</option></select>
                    <p className="text-xs text-muted-foreground">娱乐型会重点检索复玩、分享、身份和新鲜感衰减，不只搜用户抱怨。</p>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="radar-language" className="text-sm font-medium">研究语言</label>
                    <select id="radar-language" value={form.language||''} onChange={e=>setForm({...form,language:e.target.value||undefined})} className="block w-full rounded-md border bg-background p-2">{[['','按目标市场推荐'],['en','英语'],['ja','日语'],['ko','韩语'],['zh','中文'],['es','西班牙语'],['pt','葡萄牙语'],['th','泰语'],['fr','法语'],['de','德语'],['ar','阿拉伯语']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="radar-industry" className="text-sm font-medium">行业</label>
                    <Input id="radar-industry" value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} maxLength={100} placeholder="可选，例如：宠物护理、收藏" />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="radar-keyword" className="text-sm font-medium">关键词 <span className="text-muted-foreground">（可选）</span></label>
                    <Input id="radar-keyword" value={form.keyword ?? ''} onChange={e => setForm({ ...form, keyword: e.target.value })} maxLength={200} placeholder="例如：演唱会远征垫付、黑五错过退货期" />
                  </div>
                  <fieldset aria-describedby="radar-platform-help" className="min-w-0 space-y-2">
                    <legend className="mb-2 text-sm font-medium">社媒平台 <span className="text-muted-foreground">（多选）</span></legend>
                    <div className="grid grid-cols-2 gap-2">
                      {RADAR_PLATFORMS.map(platform => (
                        <label key={platform} className="radar-choice">
                          <input type="checkbox" checked={form.platforms.includes(platform)} onChange={e => setForm({ ...form, platforms: e.target.checked ? [...form.platforms, platform] : form.platforms.filter(p => p !== platform) })} />
                          <span>{platformNames[platform]}</span>
                        </label>
                      ))}
                    </div>
                    <p id="radar-platform-help" className="text-xs text-muted-foreground">{form.platforms.length ? `已选 ${form.platforms.length} 个社媒平台；未选平台不采集。` : '未选择社媒平台：仅全网检索。'}</p>
                  </fieldset>
                  <fieldset className="min-w-0 space-y-2">
                    <legend className="mb-2 text-sm font-medium">发现模式</legend>
                    <div className="grid grid-cols-2 gap-2">
                      {(['quick', 'deep'] as const).map(mode => <label key={mode} className="radar-choice"><input type="radio" name="radar-mode" value={mode} checked={form.mode === mode} onChange={() => setForm({ ...form, mode })} /><span>{mode === 'quick' ? '快速 · quick' : '深入 · deep'}</span></label>)}
                    </div>
                    <p className="text-xs text-muted-foreground">深入模式可能产生更多 API 调用；请求最长等待 180 秒。</p>
                  </fieldset>
                </fieldset>

                {authLoading || (userId && !authorized) ? <p role="status" className="text-sm">正在确认当前会话…</p> : !userId ? (
                  <div className="space-y-3"><p className="text-sm text-muted-foreground">请先登录，再使用当前会话中的 API 配置发现商机。</p><Button asChild className="radar-touch w-full"><Link to={loginUrl}>登录后发现商机</Link></Button></div>
                ) : (
                  <>
                    {!!configIssues.length && <div className="radar-note space-y-2"><p className="font-medium">API 配置提示（不影响提交）</p><ul className="list-disc space-y-1 pl-5">{configIssues.map(issue => <li key={issue}>{issue}</li>)}</ul><Button type="button" variant="outline" className="radar-touch" onClick={() => setSettingsOpen(true)}>前往设置</Button></div>}
                    {loading ? <Button type="button" variant="outline" className="radar-touch w-full" onClick={cancel}><X aria-hidden="true" />取消等待</Button>
                      : <Button type="submit" className="radar-touch w-full"><Radar aria-hidden="true" />{form.parentResearchId?'继续补证据':'发现商机'}</Button>}
                    {form.parentResearchId&&<Button type="button" variant="ghost" onClick={()=>setForm({...form,parentResearchId:undefined})}>以当前条件新建研究</Button>}
                    <p className="text-xs leading-relaxed text-muted-foreground">未保存的结果在刷新后清空；保存后可继续研究。发现可能消耗已配置服务的额度。</p>
                  </>
                )}
              </form>
            </GlassCard>
          </section>

          <section aria-labelledby="radar-results-title" aria-busy={authorized && loading} className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="radar-results-title" className="text-xl font-semibold">{result ? '本次发现' : '发现工作台'}</h2>{result && <Button type="button" variant="outline" className="radar-touch" onClick={exportResult}><Download aria-hidden="true" />导出 JSON</Button>}</div>
            {authorized&&userId&&<ResearchLibrary ownerId={userId} result={result} sessionId={sessionId} onSaved={setSessionId} onRestore={record=>{if(activeIdentity.current!==userId)return;generation.current++;activeController.current?.abort();activeController.current=null;setLoading(false);setStored({ownerId:userId,result:record.result});setForm({...record.result.request,mode:'deep',parentResearchId:record.id});setSessionId(record.id);setSelectedCandidates([]);setSavingHandoff(false);setOutcomes(record.outcomes);setNotice('已打开保存的研究；可比较候选，或用深入模式补充新证据。')}} />}
            <div role="status" aria-live="polite" aria-atomic="true" className="text-sm">{authorized && (loading ? '正在检索公开来源并分析证据，请稍候。没有实时进度可供显示。' : notice)}</div>
            {authorized && error && <div role="alert" className="radar-note border-destructive/50"><p>{error}</p>{needsLogin && <Link to={loginUrl} className="mt-2 inline-flex min-h-11 items-center underline">重新登录</Link>}</div>}
            {!result && !loading && <GlassCard className="space-y-5" padding="lg"><Globe2 aria-hidden="true" className="h-9 w-9 text-muted-foreground" /><h3 className="text-lg font-semibold">从一个具体市场开始</h3><p className="leading-relaxed text-muted-foreground">填写国家和行业后主动发起发现。证据不足时会如实返回空结果，不生成占位商机。</p><div className="radar-note flex items-start gap-2"><ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><p>社媒讨论只是线索。候选商机均为假设，仍需访谈、报价和真实付费验证。</p></div></GlassCard>}
            {result && (
              <>
                <GlassCard className="space-y-4">
                  <div className="space-y-1 text-sm"><p className="break-words font-medium">{result.request.country} · {result.request.industry || result.request.keyword || '场景研究'}{result.request.keyword && result.request.industry ? ` · ${result.request.keyword}` : ''}</p><p className="text-muted-foreground">{result.request.valueModel ? valueModelNames[result.request.valueModel] : '自动价值模型'} · {result.request.mode === 'quick' ? '快速模式' : '深入模式'} · {result.request.platforms.length ? result.request.platforms.map(p => platformNames[p]).join(' / ') : '仅全网检索'}</p><p className="text-xs text-muted-foreground">本次采集：<CollectedTime value={result.fetchedAt} /></p></div>
                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">{[
                    ['来源数', result.stats.sourceCount], ['帖子数', result.stats.postCount], ['评论数', result.stats.commentCount],
                    ['API 调用', result.stats.apiCalls], ['候选假设', result.candidates.length], ['耗时（秒）', (result.stats.durationMs / 1000).toFixed(1)],
                  ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="number-highlight mt-1 text-xl font-semibold">{value}</dd></div>)}</dl>
                  {result.quality && <div className="radar-note space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">研究覆盖度：{{research_ready:'可进入下一步',partial:'部分覆盖',insufficient:'证据不足'}[result.quality.status]}</p><span className="text-xs text-muted-foreground">独立来源 {result.quality.independentSourceCount} · 来源类型 {result.quality.sourceKindCount} · 当地语言原文 {result.quality.localLanguageSourceCount}</span></div><p className="text-xs text-muted-foreground">经历 {result.quality.evidenceTypes.experience} · 行为 {result.quality.evidenceTypes.behavior} · 重复 {result.quality.evidenceTypes.recurrence} · 付费 {result.quality.evidenceTypes.payment} · 反证 {result.quality.evidenceTypes.counter} · 分享/身份 {result.quality.evidenceTypes.sharing}</p>{result.quality.gaps.length > 0 && <p className="text-xs">待补：{result.quality.gaps.join('；')}。这些缺口表示尚未查到证据，不代表需求不存在。</p>}</div>}
                </GlassCard>
                <div className="radar-note space-y-2"><p className="font-medium">阅读边界</p><p>以下商机均为待验证假设；紧迫度是分析判断，热度不代表付费意愿。国家 / 地区仅为检索条件，来源所在地尚未验证。</p></div>
                {!!result.warnings.length && <aside aria-label="采集警告" className="radar-note"><h3 className="mb-2 font-semibold">采集警告</h3><ul className="list-disc space-y-2 pl-5">{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></aside>}
                {!!result.queryPlan?.length&&<details className="radar-note"><summary>查看实际检索记录</summary><ul className="mt-3 space-y-2 text-sm">{result.queryPlan.map((query,index)=><li key={index}>[{query.language} · {query.intent}] {query.query}</li>)}</ul></details>}
                {selectedCandidates.length>1&&<GlassCard><h3 className="mb-3 font-semibold">候选对照</h3><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">场景</th><th className="p-2">最小应用</th><th className="p-2">最大未知</th><th className="p-2">下一步</th></tr></thead><tbody>{result.candidates.filter(c=>selectedCandidates.includes(c.id)).map(c=><tr key={c.id}><td className="p-2">{c.title}</td><td className="p-2">{c.mvp||'待收敛'}</td><td className="p-2">{c.unknowns?.[0]||'尚需补充证据'}</td><td className="p-2">{c.experiment||c.recommendedNextStep}</td></tr>)}</tbody></table></div></GlassCard>}
                {!result.candidates.length && <GlassCard><h3 className="mb-2 font-semibold">暂未发现证据充分的商机</h3><p className="text-sm text-muted-foreground">请先检查采集警告，再调整行业、关键词或平台。没有候选不代表市场不存在机会。</p></GlassCard>}
                {result.candidates.map((candidate, index) => (
                  <article key={candidate.id || index} aria-labelledby={`radar-candidate-${index}`}>
                    <GlassCard className="space-y-4">
                      <div className="flex flex-wrap gap-2"><Badge variant="secondary">待验证假设</Badge><Badge variant="outline">紧迫度：{urgencyNames[candidate.urgency]}</Badge><Badge variant="outline">证据 {candidate.evidenceCount} 条</Badge></div>
                      <h3 id={`radar-candidate-${index}`} className="break-words text-xl font-semibold">{candidate.title}</h3>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label={`对比 ${candidate.title}`} checked={selectedCandidates.includes(candidate.id)} onChange={e=>setSelectedCandidates(ids=>e.target.checked?[...ids,candidate.id].slice(-3):ids.filter(id=>id!==candidate.id))}/>加入对比（最多三项）</label>
                      <p className="text-sm font-medium">{{test:'值得小测',reframe:'需要调整',pause:'暂缓',insufficient:'证据不足'}[candidate.decision||'insufficient']}</p>
                      {!!candidate.mvp&&<p className="text-sm"><strong>最小软件切口：</strong>{candidate.mvp}</p>}
                      {([['最强支持',candidate.support],['反证与限制',candidate.counter]] as const).map(([label,claims])=>claims?.length?<div key={label}><h4 className="text-sm font-semibold">{label}</h4>{claims.map((claim,i)=><div key={i} className="mt-1 text-sm">{claim.claim}<ul className="pl-4 text-xs text-muted-foreground">{claim.evidenceIds.map(id=>{const e=candidate.evidence.find(item=>item.id===id);return e?<li key={id}>“{e.snippet.slice(0,180)}”</li>:null})}</ul></div>)}</div>:null)}
                      {!!candidate.unknowns?.length&&<p className="text-sm"><strong>最大未知：</strong>{candidate.unknowns.join('；')}</p>}
                      {!!candidate.experiment&&<p className="text-sm"><strong>最小验证动作：</strong>{candidate.experiment}</p>}
                      {(() => { const gaps=deriveEvidenceGaps(candidate,result.request); return gaps.length ? <div className="radar-note"><h4 className="mb-2 font-semibold">证据缺口（按优先级）</h4><ul className="space-y-2 text-sm">{gaps.slice(0,5).map(gap=><li key={gap.id}><span className="font-medium">{gap.title}</span><span className="block text-muted-foreground">{gap.reason}</span><span className="block text-xs">下一步：{gap.action}</span></li>)}</ul></div> : null; })()}
                      <dl className="space-y-3 text-sm leading-relaxed">{[
                        ['待解决问题', candidate.problem], ['目标用户', candidate.targetUsers], ['竞争线索', candidate.competitionHint], ['建议下一步', candidate.recommendedNextStep],
                      ].map(([label, value]) => <div key={label}><dt className="mb-1 font-semibold">{label}</dt><dd className="text-muted-foreground">{value || '未提供'}</dd></div>)}</dl>
                      {!!candidate.risks.length && <div className="radar-note"><h4 className="mb-2 font-semibold">风险与待核实项</h4><ul className="list-disc space-y-1 pl-5">{candidate.risks.map((risk, i) => <li key={i}>{risk}</li>)}</ul></div>}
                      <details className="radar-evidence"><summary>查看原文证据（实际返回 {candidate.evidence.length} 条）</summary><div className="mt-3 space-y-4">{!candidate.evidence.length && <p className="text-sm text-muted-foreground">本候选没有返回可展开的原文证据，请勿将其视为已证实需求。</p>}{candidate.evidence.map((evidence, i) => {
                        const url = safeSourceUrl(evidence.url);
                        return <section key={`${evidence.id}-${i}`} className="radar-source"><h4 className="font-semibold">{evidence.title || '未提供标题'}</h4><p className="mt-1 text-xs text-muted-foreground">{platformNames[evidence.platform as RadarPlatform] || evidence.platform} · 采集时间：<CollectedTime value={evidence.collectedAt} /></p><p className="my-3 whitespace-pre-wrap text-sm leading-relaxed">{evidence.snippet || '未提供原文摘录'}</p>{url ? <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="radar-source-link">打开原文（新窗口）<span className="block break-all text-xs">{url}</span></a> : <p className="text-xs text-muted-foreground">未提供有效的 HTTPS 原文链接</p>}</section>;
                      })}</div></details>
                      <Button type="button" variant="outline" className="radar-touch" disabled={savingHandoff} onClick={()=>void enterValidation(candidate)}>进入验证<ArrowRight aria-hidden="true" /></Button>
                      {sessionId&&userId&&<ResearchOutcomeEditor ownerId={userId} sessionId={sessionId} candidateId={candidate.id} initialOutcomes={outcomes[candidate.id]}/>}
                      <p className="text-xs text-muted-foreground">保存并携带原文进入验证；进入后确认研究范围，再手动开始分析。</p>
                    </GlassCard>
                  </article>
                ))}
              </>
            )}
          </section>
        </div>
      </main>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} trigger={<span hidden />} />
    </PageBackground>
  );
}
