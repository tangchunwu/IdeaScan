import { TikHubClient, TikHubError } from './tikhub-client.ts';

export const DIAGNOSTIC_PLATFORMS = ['xiaohongshu', 'douyin', 'tiktok', 'instagram', 'youtube', 'reddit'] as const;
export type DiagnosticPlatform = typeof DIAGNOSTIC_PLATFORMS[number];
export interface DiagnosticStage {
  status: 'success' | 'failed' | 'unknown' | 'skipped';
  count: number; apiCalls: number; httpStatus: number | null;
  businessCode?: number | string; kind?: string; requestId?: string; message: string;
}
export interface PlatformDiagnostic {
  platform: DiagnosticPlatform; valid: boolean; message: string; apiCalls: number; latencyMs: number;
  search: DiagnosticStage; comment: DiagnosticStage;
}

const record = (value: unknown): Record<string, any> => value && typeof value === 'object' ? value as Record<string, any> : {};
const safeValue = (value: unknown, token: string): string | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value);
  return text.length <= 100 && /^[\w.:-]+$/.test(text) && (!token || !text.includes(token)) ? text : undefined;
};
export function diagnosticFailure(error: unknown, token = ''): Partial<DiagnosticStage> {
  const e = record(error);
  const kinds = ['http', 'business', 'timeout', 'network', 'invalid_response', 'auth', 'budget'];
  const rawStatus = 'httpStatus' in e ? e.httpStatus : e.status;
  const status = typeof rawStatus === 'number' && rawStatus >= 100 && rawStatus <= 599 ? rawStatus : null;
  const kind = kinds.includes(e.kind) ? e.kind : status !== null ? 'http' : 'unknown';
  return {
    httpStatus: status,
    businessCode: typeof e.businessCode === 'number' ? e.businessCode : safeValue(e.businessCode ?? e.code, token),
    requestId: safeValue(e.requestId, token), kind,
    message: error instanceof TikHubError
      ? scrubDiagnosticMessage(error.upstreamMessage || error.message, token)
      : `诊断失败（${kind}）`,
  };
}
function scrubDiagnosticMessage(message: string, token: string): string {
  let text = message;
  for (const secret of [token, encodeURIComponent(token)]) if (secret) text = text.split(secret).join('[redacted]');
  text = text.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/((?:api[_ -]?key|token|authorization|secret|password)\s*[:=]\s*)["']?[^\s,;"']+/gi, '$1[redacted]')
    .replace(/[A-Za-z0-9_+\/-]{32,}={0,2}/g, '[redacted]');
  return text.slice(0, 300);
}
const stage = (status: DiagnosticStage['status'], message: string): DiagnosticStage => ({ status, message, count: 0, apiCalls: 0, httpStatus: null });
function postId(platform: DiagnosticPlatform, item: unknown): string {
  const outer = record(item);
  const p = record(outer.aweme_info || outer.media || outer.post || outer.data || item);
  const value = platform === 'xiaohongshu' ? p.id || p.note_id
    : platform === 'douyin' || platform === 'tiktok' ? p.aweme_id
    : platform === 'instagram' ? p.code || p.shortcode
    : platform === 'youtube' ? p.video_id || p.videoId : p.name || p.id;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return '';
  if (platform !== 'reddit') return value;
  if (/^t[12]_/.test(value) || /^t\d_/.test(value) && !value.startsWith('t3_')) return '';
  return value.startsWith('t3_') ? value : `t3_${value}`;
}

export async function runTikHubDiagnostics(token: string, platforms: string[], options: {
  commentProbe?: boolean; signal?: AbortSignal; deadlineMs?: number;
} = {}) {
  const selected = [...new Set(platforms)].filter((p): p is DiagnosticPlatform => DIAGNOSTIC_PLATFORMS.includes(p as DiagnosticPlatform));
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const timer = setTimeout(abort, Math.max(1, Math.min(55_000, options.deadlineMs ?? 55_000)));
  const results: PlatformDiagnostic[] = [];
  let client: TikHubClient | undefined;
  let tokenValid = false;
  let stopped = false;
  let auth = stage('unknown', '尚未验证');
  const calls = () => client?.stats.apiCalls ?? 0;
  const execute = async (target: DiagnosticStage, action: () => Promise<any>) => {
    const before = calls();
    try {
      if (controller.signal.aborted) throw { kind: 'budget', httpStatus: null };
      const value = await action();
      target.status = 'success'; target.message = '请求成功'; target.httpStatus = 200;
      return value;
    } catch (error) {
      Object.assign(target, diagnosticFailure(error, token), { status: 'failed' });
      const e = record(error);
      const quotaFailure = /insufficient (?:balance|credits)|quota (?:exceeded|exhausted)|额度不足|余额不足/i.test(String(e.upstreamMessage || ''));
      if ([e.httpStatus, Number(e.businessCode), e.status].some(code => [401, 402, 403, 422].includes(code)) || e.kind === 'budget' || quotaFailure) stopped = true;
      return undefined;
    } finally { target.apiCalls = calls() - before; }
  };
  try {
    auth = stage('unknown', '尚未验证');
    try { client = new TikHubClient(token, { timeoutMs: 8_000, maxRetries: 0, maxRequests: 13, signal: controller.signal }); }
    catch (error) { Object.assign(auth, diagnosticFailure(error, token), { status: 'failed' }); }
    if (client) await execute(auth, () => client!.getUserInfo());
    tokenValid = auth.status === 'success';
    stopped ||= !tokenValid;
    for (const platform of selected) {
      const start = Date.now(); const before = calls();
      const search = stage('skipped', '流程已停止，未发起搜索');
      const comment = stage('skipped', '未取得有效帖子 ID，未验证评论');
      if (!stopped && !controller.signal.aborted) {
        const methods = { xiaohongshu: () => client!.searchXhs('测试'), douyin: () => client!.searchDouyin('测试'),
          tiktok: () => client!.searchTikTok('test', { count: 1 }), instagram: () => client!.searchInstagram('test'),
          youtube: () => client!.searchYouTube('test', { type: 'video' }), reddit: () => client!.searchReddit('test') };
        const page = await execute(search, methods[platform]);
        if (page !== undefined) {
          const items = page.notes || page.videos || page.items || page.posts || page.children || [];
          search.count = Array.isArray(items) ? items.length : 0;
          const id = Array.isArray(items) ? items.map(item => postId(platform, item)).find(Boolean) : '';
          if (options.commentProbe === false) comment.message = '连通性模式不验证评论';
          else if (id && !stopped) {
            const comments = await execute(comment, async () => {
              if (platform === 'xiaohongshu') {
                return client!.getXhsCommentsFirstPage(id, 1);
              }
              const methods = { douyin: () => client!.getDouyinComments(id, 1), tiktok: () => client!.getTikTokComments(id, 1),
                instagram: () => client!.getInstagramComments(id, 1), youtube: () => client!.getYouTubeComments(id, 1), reddit: () => client!.getRedditComments(id, 1) };
              return methods[platform]();
            });
            comment.count = Array.isArray(comments) ? comments.length : comments?.comments?.length ?? 0;
          }
        }
      }
      const valid = search.status === 'success' && (options.commentProbe === false || comment.status === 'success');
      results.push({ platform, valid, search, comment, message: valid ? '诊断通过' : search.status === 'failed' ? search.message : comment.message, apiCalls: calls() - before, latencyMs: Date.now() - start });
    }
    return { valid: tokenValid && results.length > 0 && results.every(p => p.valid), tokenValid, auth, message: tokenValid ? '平台诊断完成，请查看分阶段结果' : 'Token 鉴权未通过', platforms: results, apiCalls: calls() };
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}
