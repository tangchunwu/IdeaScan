import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { invokeFunction } from '@/lib/invokeFunction';
import { DIAGNOSTIC_PLATFORMS, diagnosticFailure, type DiagnosticStage, type PlatformDiagnostic } from '../../../supabase/functions/_shared/tikhub-probe';

const names = { xiaohongshu: '小红书', douyin: '抖音', tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', reddit: 'Reddit', twitter: 'X / Twitter', threads: 'Threads' };
const statuses = { success: '成功', failed: '失败', unknown: '未知', skipped: '未验证' };
function detail(value: Partial<DiagnosticStage>) {
  return [value.httpStatus == null ? 'HTTP 未知/无响应' : `HTTP ${value.httpStatus}`, value.businessCode != null && `code ${value.businessCode}`, value.kind && `type ${value.kind}`, value.requestId && `requestId ${value.requestId}`].filter(Boolean).join(' · ');
}
function isDiagnosticResponse(value: unknown): value is { message?: string; apiCalls?: number; auth: DiagnosticStage; platforms: PlatformDiagnostic[] } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (!candidate.auth || !Array.isArray(candidate.platforms)) return false;
  const auth = candidate.auth as Record<string, unknown>;
  return typeof auth.status === 'string' && candidate.platforms.every(item => {
    if (!item || typeof item !== 'object') return false;
    const platform = item as Record<string, unknown>;
    return !!platform.search && !!platform.comment && typeof (platform.search as Record<string, unknown>).status === 'string' && typeof (platform.comment as Record<string, unknown>).status === 'string';
  });
}
export function TikHubDiagnosticPanel({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ message?: string; apiCalls?: number; auth?: DiagnosticStage; platforms?: PlatformDiagnostic[] } | null>(null);
  const generation = useRef(0);
  useEffect(() => { generation.current++; setResult(null); setBusy(false); return () => { generation.current++; }; }, [token]);
  const diagnose = async (platforms?: string[]) => {
    const run = ++generation.current;
    setBusy(true); setResult(null);
    try {
      const { data, error } = await invokeFunction<NonNullable<typeof result>>('verify-config', { body: { type: 'tikhub', apiKey: token, ...(platforms ? { platforms } : {}) } });
      if (run !== generation.current) return;
      if (error) throw error;
      if (!isDiagnosticResponse(data)) {
        setResult({ message: '诊断响应格式过旧，请先部署最新版 verify-config（未展示旧响应）' });
        return;
      }
      setResult(data);
    } catch (error) {
      if (run === generation.current) { const safe = diagnosticFailure(error, token); setResult({ message: `${safe.message} · ${detail(safe)} · 实际调用数未知` }); }
    } finally { if (run === generation.current) setBusy(false); }
  };
  return <div className="grid gap-2">
    <p className="text-xs text-muted-foreground">仅临时诊断，不自动保存 Token。鉴权一次，每个平台最多搜索一次、评论一次；可能消耗配额。</p>
    <Button variant="outline" size="sm" disabled={busy || !token} onClick={() => diagnose()}>测试连通性</Button>
    <div className="flex flex-wrap gap-2">{DIAGNOSTIC_PLATFORMS.map(platform => <Button key={platform} variant="outline" size="sm" disabled={busy || !token} onClick={() => diagnose([platform])}>诊断 {names[platform]}</Button>)}</div>
    <Button variant="outline" size="sm" disabled={busy || !token} onClick={() => diagnose([...DIAGNOSTIC_PLATFORMS])}>诊断全部八平台（最多 17 次）</Button>
    {busy && <p role="status" className="text-xs">诊断中，最长约 55 秒…</p>}
    {result && <div role="status" className="grid gap-2 text-xs break-words">
      <p>{result.message} · 实际调用数 {result.apiCalls ?? '未知'}</p>
      {result.auth && <p>鉴权：{statuses[result.auth.status]} · {detail(result.auth)} · {result.auth.apiCalls} 次</p>}
      {result.platforms?.map(item => <div key={item.platform} className="rounded border p-2 space-y-1">
        <p>{names[item.platform]} · {item.apiCalls} 次 · {item.latencyMs}ms</p>
        {(['search', 'comment'] as const).map(key => <p key={key}>{key === 'search' ? '搜索' : '评论'}：{statuses[item[key].status]} · {item[key].count} 条 · {item[key].apiCalls} 次 · {detail(item[key])} · {item[key].message}</p>)}
      </div>)}
    </div>}
  </div>;
}
