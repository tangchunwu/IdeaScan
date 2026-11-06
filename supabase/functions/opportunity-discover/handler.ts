import { parseOpportunityRequest, RadarInputError } from './core.ts';
import type { OpportunityRequest, OpportunityResult } from '../_shared/opportunity-types.ts';

export type RadarRuntimeConfig = Partial<Record<'llmBaseUrl' | 'llmApiKey' | 'llmModel' | 'tikhubToken' | 'bochaApiKey' | 'youApiKey' | 'tavilyApiKey', string>>;
export class RadarServiceError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export function parseRadarConfig(input: unknown): RadarRuntimeConfig {
  if (input === undefined) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RadarInputError('配置格式不正确');
  const config: RadarRuntimeConfig = {};
  for (const key of ['llmBaseUrl', 'llmApiKey', 'llmModel', 'tikhubToken', 'bochaApiKey', 'youApiKey', 'tavilyApiKey'] as const) {
    const value = (input as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length > 4096) throw new RadarInputError('配置格式不正确');
    config[key] = value.trim();
  }
  return config;
}

export function createOpportunityHandler(deps: {
  authenticate: (token: string) => Promise<string | { userId: string; external: boolean } | null>;
  research: (request: OpportunityRequest, config: RadarRuntimeConfig, userId: string, authMode?: 'session' | 'external') => Promise<OpportunityResult>;
  now?: () => number;
}) {
  const lastRuns = new Map<string, number>();
  const activeUsers = new Set<string>();
  const now = deps.now || Date.now;
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json({ error: '仅支持 POST 请求' }, 405);
    const token = req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] || req.headers.get('x-ideascan-key')?.trim();
    if (!token) return json({ error: '请先登录' }, 401);
    let userId: string | null;
    let authMode: 'session' | 'external' = 'session';
    try {
      const authenticated = await deps.authenticate(token);
      if (authenticated && typeof authenticated === 'object') { userId = authenticated.userId; authMode = authenticated.external ? 'external' : 'session'; }
      else userId = typeof authenticated === 'string' ? authenticated : null;
    } catch { return json({ error: '登录验证暂不可用' }, 503); }
    if (!userId) return json({ error: '登录态已失效，请重新登录' }, 401);
    let reserved = false;
    try {
      if (Number(req.headers.get('content-length')) > 32768) return json({ error: '请求过大' }, 413);
      const reader = req.body?.getReader();
      if (!reader) throw new RadarInputError('请求不能为空');
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 32768) { await reader.cancel(); return json({ error: '请求过大' }, 413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let body: Record<string, unknown>;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new RadarInputError('请求必须为 JSON'); }
      const request = parseOpportunityRequest(body);
      const config = parseRadarConfig(body.config);
      const time = now();
      for (const [id, timestamp] of lastRuns) if (time - timestamp >= 60000) lastRuns.delete(id);
      // 仅作实例内防连点，不能代替生产环境的分布式额度控制。
      if (activeUsers.has(userId) || lastRuns.has(userId) || activeUsers.size >= 2) return json({ error: '研究任务繁忙，请一分钟后重试' }, 429);
      lastRuns.set(userId, time);
      activeUsers.add(userId);
      reserved = true;
      const result = authMode === 'external'
        ? await deps.research(request, config, userId, 'external')
        : await deps.research(request, config, userId);
      return json(result);
    } catch (error) {
      if (error instanceof RadarInputError) return json({ error: error.message }, 400);
      if (error instanceof RadarServiceError) return json({ error: error.message }, error.status);
      return json({ error: '研究暂未完成，请检查配置或稍后重试' }, 502);
    } finally {
      if (reserved) activeUsers.delete(userId);
    }
  };
}
