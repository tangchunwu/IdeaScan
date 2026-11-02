import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { RADAR_PLATFORMS, type OpportunityRequest, type OpportunityResult } from '@/types/opportunity';
import type { UserSettings } from '@/hooks/useSettings';

export type OpportunityConfig = Pick<UserSettings,
  'llmBaseUrl' | 'llmApiKey' | 'llmModel' | 'tikhubToken' | 'bochaApiKey' | 'youApiKey' | 'tavilyApiKey'>;

export class OpportunityRadarError extends Error {
  constructor(public readonly code: 'auth' | 'config' | 'request' | 'response' | 'timeout', message: string) {
    super(message);
    this.name = 'OpportunityRadarError';
  }
}

const requestSchema = z.object({
  country: z.string().trim().min(1).max(80),
  industry: z.string().trim().min(1).max(100),
  keyword: z.string().trim().max(200).optional(),
  platforms: z.array(z.enum(RADAR_PLATFORMS)).max(6),
  mode: z.enum(['quick', 'deep']),
});
const count = z.number().finite().int().nonnegative();
const resultSchema = z.object({
  schemaVersion: z.literal(1),
  fetchedAt: z.string(),
  request: requestSchema,
  candidates: z.array(z.object({
    id: z.string(), title: z.string(), problem: z.string(), targetUsers: z.string(),
    urgency: z.enum(['high', 'medium', 'low']), evidenceCount: count,
    competitionHint: z.string(), recommendedNextStep: z.string(), risks: z.array(z.string()),
    kind: z.literal('hypothesis'),
    evidence: z.array(z.object({
      id: z.string(), platform: z.string(), title: z.string(), snippet: z.string(),
      url: z.string().transform(value => {
        try {
          const url = new URL(value);
          return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
        } catch { return ''; }
      }), collectedAt: z.string(), kind: z.literal('fact'),
    })),
  })),
  warnings: z.array(z.string()),
  stats: z.object({ sourceCount: count, postCount: count, commentCount: count, apiCalls: count, durationMs: z.number().finite().nonnegative() }),
});

export function getOpportunityConfigIssues(config: OpportunityConfig, request: OpportunityRequest): string[] {
  const issues: string[] = [];
  if (!config.llmBaseUrl?.trim() || !config.llmApiKey?.trim() || !config.llmModel?.trim()) {
    issues.push('本会话模型配置不完整，将由服务端尝试默认模型配置；也可在设置中补充。');
  }
  if (request.platforms.length && !config.tikhubToken?.trim()) {
    issues.push('本会话未填写 TikHub Token，将尝试服务端默认配置；平台不可用时会显示采集警告。');
  }
  if (![config.bochaApiKey, config.youApiKey, config.tavilyApiKey].some(key => key?.trim())) {
    issues.push('本会话未填写搜索密钥，将尝试服务端搜索池；也可在设置中配置 Bocha、You.com 或 Tavily。');
  }
  return issues;
}

// 逐层白名单解析，避免服务端额外字段或配置进入内存结果和导出文件。
export function serializeOpportunityResult(result: OpportunityResult): string {
  return JSON.stringify(resultSchema.parse(result), null, 2);
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => { cleanup(); reject(new DOMException('请求已取消', 'AbortError')); };
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) onAbort();
  });
}

export async function discoverOpportunities(
  input: OpportunityRequest,
  settings: OpportunityConfig,
  options: { signal?: AbortSignal; expectedUserId: string },
): Promise<OpportunityResult> {
  const controller = new AbortController();
  const { signal } = controller;
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 180_000);
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user.id !== options.expectedUserId) controller.abort();
  });
  const checkActive = () => { if (signal.aborted) throw new DOMException('请求已取消', 'AbortError'); };

  try {
    const run = async () => {
      checkActive();
      const parsed = requestSchema.safeParse(input);
      if (!parsed.success) throw new OpportunityRadarError('request', '请检查国家、行业和检索条件。');
      const request = parsed.data as OpportunityRequest;
      const config: OpportunityConfig = {
        llmBaseUrl: settings.llmBaseUrl, llmApiKey: settings.llmApiKey, llmModel: settings.llmModel,
        tikhubToken: settings.tikhubToken, bochaApiKey: settings.bochaApiKey,
        youApiKey: settings.youApiKey, tavilyApiKey: settings.tavilyApiKey,
      };
      const baseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
      const apikey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '');
      if (!baseUrl || !apikey) throw new OpportunityRadarError('config', '应用服务地址未配置，请联系管理员。');

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      checkActive();
      if (sessionError || !session?.access_token || !options.expectedUserId || session.user.id !== options.expectedUserId) {
        throw new OpportunityRadarError('auth', '请重新登录后再开始发现。');
      }
      const { data: { user }, error: userError } = await supabase.auth.getUser(session.access_token);
      checkActive();
      if (userError || !user || user.id !== options.expectedUserId) {
        throw new OpportunityRadarError('auth', '登录身份未通过验证，请重新登录。');
      }
      const response = await fetch(`${baseUrl}/functions/v1/opportunity-discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey },
        body: JSON.stringify({ ...request, config }),
        signal,
      });
      checkActive();
      if (response.status === 401) throw new OpportunityRadarError('auth', '登录已失效，请重新登录。');
      if (!response.ok) {
        if (response.status === 400) {
          const payload: unknown = await response.json().catch(() => null);
          checkActive();
          const detail = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
            ? payload.error.replace(/\s+/g, ' ').trim().slice(0, 240) : '';
          throw new OpportunityRadarError('config', detail || '服务未接受当前条件或配置，请检查设置。');
        }
        const message = response.status === 429 ? '请求过于频繁或额度不足，请稍后重试。'
          : `发现服务暂时不可用（HTTP ${response.status}），请稍后重试。`;
        throw new OpportunityRadarError('response', message);
      }
      const result = resultSchema.safeParse(await response.json());
      checkActive();
      if (!result.success) throw new OpportunityRadarError('response', '服务返回的结果格式不完整，请重试。');
      return result.data as OpportunityResult;
    };
    return await abortable(run(), signal);
  } catch (error) {
    if (timedOut) throw new OpportunityRadarError('timeout', '请求超过 180 秒，已停止等待；已发出的上游请求仍可能计费。');
    if (signal.aborted) throw new DOMException('请求已取消', 'AbortError');
    if (error instanceof OpportunityRadarError) throw error;
    // 不向界面转发供应商响应或底层异常，避免其中回显密钥。
    throw new OpportunityRadarError('response', '商机发现失败，请检查网络和设置后重试。');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
    subscription.unsubscribe();
  }
}
