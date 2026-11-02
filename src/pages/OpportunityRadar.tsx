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

const platformNames: Record<RadarPlatform, string> = {
  xiaohongshu: '小红书', douyin: '抖音', tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', reddit: 'Reddit',
};
const countries = ['United States', 'China', 'United Kingdom', 'Canada', 'Australia', 'Singapore', 'Japan', 'South Korea', 'Germany', 'France', 'India', 'Indonesia', 'Brazil', 'Mexico', 'United Arab Emirates'];
const urgencyNames = { high: '高', medium: '中', low: '低' };

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
                    <label htmlFor="radar-industry" className="text-sm font-medium">行业</label>
                    <Input id="radar-industry" value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} required maxLength={100} placeholder="例如：宠物护理、跨境物流" />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="radar-keyword" className="text-sm font-medium">关键词 <span className="text-muted-foreground">（可选）</span></label>
                    <Input id="radar-keyword" value={form.keyword ?? ''} onChange={e => setForm({ ...form, keyword: e.target.value })} maxLength={200} placeholder="进一步缩小问题或人群" />
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
                      : <Button type="submit" className="radar-touch w-full"><Radar aria-hidden="true" />发现商机</Button>}
                    <p className="text-xs leading-relaxed text-muted-foreground">仅本页内存保留结果，刷新或切换账号即清空。请求将把所需 API 密钥发送至发现服务用于调用上游，可能计费。</p>
                  </>
                )}
              </form>
            </GlassCard>
          </section>

          <section aria-labelledby="radar-results-title" aria-busy={authorized && loading} className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="radar-results-title" className="text-xl font-semibold">{result ? '本次发现' : '发现工作台'}</h2>{result && <Button type="button" variant="outline" className="radar-touch" onClick={exportResult}><Download aria-hidden="true" />导出 JSON</Button>}</div>
            <div role="status" aria-live="polite" aria-atomic="true" className="text-sm">{authorized && (loading ? '正在检索公开来源并分析证据，请稍候。没有实时进度可供显示。' : notice)}</div>
            {authorized && error && <div role="alert" className="radar-note border-destructive/50"><p>{error}</p>{needsLogin && <Link to={loginUrl} className="mt-2 inline-flex min-h-11 items-center underline">重新登录</Link>}</div>}
            {!result && !loading && <GlassCard className="space-y-5" padding="lg"><Globe2 aria-hidden="true" className="h-9 w-9 text-muted-foreground" /><h3 className="text-lg font-semibold">从一个具体市场开始</h3><p className="leading-relaxed text-muted-foreground">填写国家和行业后主动发起发现。证据不足时会如实返回空结果，不生成占位商机。</p><div className="radar-note flex items-start gap-2"><ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><p>社媒讨论只是线索。候选商机均为假设，仍需访谈、报价和真实付费验证。</p></div></GlassCard>}
            {result && (
              <>
                <GlassCard className="space-y-4">
                  <div className="space-y-1 text-sm"><p className="break-words font-medium">{result.request.country} · {result.request.industry}{result.request.keyword ? ` · ${result.request.keyword}` : ''}</p><p className="text-muted-foreground">{result.request.mode === 'quick' ? '快速模式' : '深入模式'} · {result.request.platforms.length ? result.request.platforms.map(p => platformNames[p]).join(' / ') : '仅全网检索'}</p><p className="text-xs text-muted-foreground">本次采集：<CollectedTime value={result.fetchedAt} /></p></div>
                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">{[
                    ['来源数', result.stats.sourceCount], ['帖子数', result.stats.postCount], ['评论数', result.stats.commentCount],
                    ['API 调用', result.stats.apiCalls], ['候选假设', result.candidates.length], ['耗时（秒）', (result.stats.durationMs / 1000).toFixed(1)],
                  ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="number-highlight mt-1 text-xl font-semibold">{value}</dd></div>)}</dl>
                </GlassCard>
                <div className="radar-note space-y-2"><p className="font-medium">阅读边界</p><p>以下商机均为待验证假设；紧迫度是分析判断，热度不代表付费意愿。国家 / 地区仅为检索条件，来源所在地尚未验证。</p></div>
                {!!result.warnings.length && <aside aria-label="采集警告" className="radar-note"><h3 className="mb-2 font-semibold">采集警告</h3><ul className="list-disc space-y-2 pl-5">{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></aside>}
                {!result.candidates.length && <GlassCard><h3 className="mb-2 font-semibold">暂未发现证据充分的商机</h3><p className="text-sm text-muted-foreground">请先检查采集警告，再调整行业、关键词或平台。没有候选不代表市场不存在机会。</p></GlassCard>}
                {result.candidates.map((candidate, index) => (
                  <article key={candidate.id || index} aria-labelledby={`radar-candidate-${index}`}>
                    <GlassCard className="space-y-4">
                      <div className="flex flex-wrap gap-2"><Badge variant="secondary">待验证假设</Badge><Badge variant="outline">紧迫度：{urgencyNames[candidate.urgency]}</Badge><Badge variant="outline">证据 {candidate.evidenceCount} 条</Badge></div>
                      <h3 id={`radar-candidate-${index}`} className="break-words text-xl font-semibold">{candidate.title}</h3>
                      <dl className="space-y-3 text-sm leading-relaxed">{[
                        ['待解决问题', candidate.problem], ['目标用户', candidate.targetUsers], ['竞争线索', candidate.competitionHint], ['建议下一步', candidate.recommendedNextStep],
                      ].map(([label, value]) => <div key={label}><dt className="mb-1 font-semibold">{label}</dt><dd className="text-muted-foreground">{value || '未提供'}</dd></div>)}</dl>
                      {!!candidate.risks.length && <div className="radar-note"><h4 className="mb-2 font-semibold">风险与待核实项</h4><ul className="list-disc space-y-1 pl-5">{candidate.risks.map((risk, i) => <li key={i}>{risk}</li>)}</ul></div>}
                      <details className="radar-evidence"><summary>查看原文证据（实际返回 {candidate.evidence.length} 条）</summary><div className="mt-3 space-y-4">{!candidate.evidence.length && <p className="text-sm text-muted-foreground">本候选没有返回可展开的原文证据，请勿将其视为已证实需求。</p>}{candidate.evidence.map((evidence, i) => {
                        const url = safeSourceUrl(evidence.url);
                        return <section key={`${evidence.id}-${i}`} className="radar-source"><h4 className="font-semibold">{evidence.title || '未提供标题'}</h4><p className="mt-1 text-xs text-muted-foreground">{platformNames[evidence.platform as RadarPlatform] || evidence.platform} · 采集时间：<CollectedTime value={evidence.collectedAt} /></p><p className="my-3 whitespace-pre-wrap text-sm leading-relaxed">{evidence.snippet || '未提供原文摘录'}</p>{url ? <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="radar-source-link">打开原文（新窗口）<span className="block break-all text-xs">{url}</span></a> : <p className="text-xs text-muted-foreground">未提供有效的 HTTPS 原文链接</p>}</section>;
                      })}</div></details>
                      <Button type="button" variant="outline" className="radar-touch" onClick={() => {
                        if (activeIdentity.current !== userId) return;
                        navigate(getOpportunityValidationUrl({ title: candidate.title, problem: candidate.problem, targetUsers: candidate.targetUsers, country: result.request.country, industry: result.request.industry, platforms: result.request.platforms }));
                      }}>进入验证<ArrowRight aria-hidden="true" /></Button>
                      <p className="text-xs text-muted-foreground">{result.request.platforms.length ? '仅预填本次结果的条件；进入后需手动开始验证。' : '本候选来自全网检索。现有验证流程至少需要一个社媒平台，进入后请先补选平台，再手动开始验证。'}</p>
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
