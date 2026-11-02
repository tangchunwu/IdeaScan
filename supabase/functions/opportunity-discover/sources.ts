import type { OpportunityEvidence, OpportunityRequest } from '../_shared/opportunity-types.ts';
import { RADAR_PLATFORMS } from '../_shared/opportunity-types.ts';
import { MultiChannelOrchestrator } from '../_shared/channels/channel-registry.ts';
import type { ChannelType, UnifiedPost } from '../_shared/channels/types.ts';

export interface RadarSourceConfig {
  tikhubToken?: string;
  bochaApiKey?: string;
  youApiKey?: string;
  tavilyApiKey?: string;
}

interface SourceCollection {
  evidence: OpportunityEvidence[];
  warnings: string[];
  postCount: number;
  commentCount: number;
  apiCalls: number;
}

type JsonRecord = Record<string, unknown>;
type SearchProvider = 'bocha' | 'you' | 'tavily';
const SEARCH_TIMEOUT_MS = 20_000;
const DOMESTIC = new Set<ChannelType>(['xiaohongshu', 'douyin']);

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}

/** 仅离线校验，不解析 DNS 或请求证据链接；允许公网 IPv4，拒绝私网/保留 IPv4 及所有 IPv6。 */
export function safePublicHttpsUrl(value: unknown): string | null {
  // eslint-disable-next-line no-control-regex -- 拒绝 URL 解析器可能忽略的控制字符，避免主机校验绕过。
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    // IPv6 字面量全部保守拒绝，避免压缩、映射地址等解析差异。
    if (host.includes(':') || !host.includes('.')) return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const [a, b, c] = host.split('.').map(Number);
      if (a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
        (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
        (a === 203 && b === 0 && c === 113)) return null;
    } else {
      if (!host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
      if (!/^[a-z][a-z0-9-]+$/.test(host.split('.').at(-1)!)) return null;
      if (/(^|\.)(localhost|local|internal|intranet|lan|home|test|invalid|example|onion)$/.test(host)) return null;
    }
    url.hostname = host;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function cleanText(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, entity: string) => {
      if (!entity.startsWith('#')) return entities[entity.toLowerCase()] ?? whole;
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ' ';
    })
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    // eslint-disable-next-line no-control-regex -- 清除供应商文本中的控制字符和不可见方向控制符。
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, limit);
}

function overseasEnabled(): boolean {
  try {
    const runtime = globalThis as typeof globalThis & { Deno?: { env?: { get?: (name: string) => string | undefined } } };
    return runtime.Deno?.env?.get?.('ENABLE_OVERSEAS_SOCIAL') === 'true';
  } catch {
    return false;
  }
}

function postUrl(post: UnifiedPost): string | null {
  const raw = record(post.raw_data);
  // 只读取现有适配器保留的原始结构，不假设 UnifiedPost 上存在 url，也不猜测 ID 路由。
  const layers = [raw, record(raw.post), record(raw.data), record(raw.media), record(raw.video)];
  for (const layer of layers) {
    for (const source of [layer, record(layer.share_info)]) {
      for (const key of ['permalink', 'share_url', 'web_url', 'url']) {
        let candidate = source[key];
        if (post.platform === 'reddit' && key === 'permalink' && typeof candidate === 'string' &&
          /^\/r\/[^/]+\/comments\/[a-z0-9]+(?:\/|$)/i.test(candidate) && !candidate.includes('\\')) {
          candidate = `https://www.reddit.com${candidate}`;
        }
        const url = safePublicHttpsUrl(candidate);
        if (url) return url;
      }
    }
  }
  // 仅对具有固定公开路由且 ID 形状明确的平台生成原帖地址，不能拿任意 API ID 猜链接。
  if (post.platform === 'youtube' && /^[A-Za-z0-9_-]{11}$/.test(post.post_id)) return `https://www.youtube.com/watch?v=${post.post_id}`;
  if (post.platform === 'xiaohongshu' && /^[a-f0-9]{24}$/i.test(post.post_id)) return `https://www.xiaohongshu.com/explore/${post.post_id}`;
  if (post.platform === 'douyin' && /^\d{15,22}$/.test(post.post_id)) return `https://www.douyin.com/video/${post.post_id}`;
  if (post.platform === 'instagram') {
    const media = record(raw.media);
    const code = raw.code || raw.shortcode || media.code || media.shortcode;
    if (typeof code === 'string' && /^[A-Za-z0-9_-]{5,32}$/.test(code)) return `https://www.instagram.com/p/${code}/`;
  }
  if (post.platform === 'tiktok') {
    const handle = record(raw.author).unique_id;
    if (typeof handle === 'string' && /^[A-Za-z0-9_.]{1,30}$/.test(handle) && /^\d{15,22}$/.test(post.post_id)) return `https://www.tiktok.com/@${handle}/video/${post.post_id}`;
  }
  return null;
}

async function fetchSearchJson(endpoint: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error('Search deadline exceeded'));
    }, SEARCH_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(endpoint, { ...init, redirect: 'error', signal: controller.signal });
        if (!response.ok) {
          // 错误体可能包含供应商回显的密钥，不读取、不记录、不透传。
          void response.body?.cancel().catch(() => {});
          throw new Error('Search request failed');
        }
        return await response.json() as unknown;
      })(),
      deadline,
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function searchWeb(provider: SearchProvider, key: string, query: string, country: string, count: number): Promise<unknown[]> {
  let body: unknown;
  const headers = { 'Content-Type': 'application/json' };
  if (provider === 'bocha') {
    body = await fetchSearchJson('https://api.bochaai.com/v1/web-search', {
      method: 'POST', headers: { ...headers, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query, freshness: 'noLimit', summary: true, count }),
    });
  } else if (provider === 'you') {
    const url = new URL('https://ydc-index.io/v1/search');
    url.searchParams.set('query', query);
    url.searchParams.set('count', String(count));
    // 国家名称仍保留在原查询中；仅将合约支持的两位国家码送入 country 参数。
    if (/^[a-z]{2}$/i.test(country)) url.searchParams.set('country', country.toUpperCase());
    body = await fetchSearchJson(url.href, { method: 'GET', headers: { 'X-API-Key': key } });
  } else {
    body = await fetchSearchJson('https://api.tavily.com/search', {
      method: 'POST', headers,
      body: JSON.stringify({ api_key: key, query, search_depth: 'basic', max_results: count,
        include_answer: false, include_images: false }),
    });
  }
  const payload = record(body);
  const items = provider === 'bocha' ? record(record(payload.data).webPages).value
    : provider === 'you' ? record(payload.results).web : payload.results;
  if (!Array.isArray(items)) throw new Error('Invalid search response');
  return items.slice(0, count);
}

export async function collectOpportunitySources(request: OpportunityRequest, config: RadarSourceConfig): Promise<SourceCollection> {
  const output: SourceCollection = { evidence: [], warnings: [], postCount: 0, commentCount: 0, apiCalls: 0 };
  const warnings = new Set<string>();
  const query = [request.country, request.industry, request.keyword].filter(value => value?.trim()).map(value => value!.trim()).join(' ');
  const intent = /[\u3400-\u9fff]/.test(request.industry)
    ? '手工 低效 替代' : 'manual workflow pain points alternatives';
  const webQuery = `${query} ${intent}`;
  const quick = request.mode === 'quick';
  const postLimit = quick ? 5 : 10;
  const commentPostLimit = quick ? 3 : 5;
  const commentLimit = quick ? 4 : 10;
  const collectedAt = new Date().toISOString();
  const addEvidence = (platform: string, title: unknown, snippet: unknown, url: string) => {
    const cleanedTitle = cleanText(title, 180);
    const cleanedSnippet = cleanText(snippet, 1200);
    if (!cleanedTitle && !cleanedSnippet) {
      warnings.add(`${platform}: 已丢弃空白证据。`);
      return;
    }
    output.evidence.push({ id: `source-${output.evidence.length + 1}`, platform,
      title: cleanedTitle || cleanedSnippet.slice(0, 180), snippet: cleanedSnippet,
      url, collectedAt, kind: 'fact' });
  };
  if (!query) {
    output.warnings.push('查询为空，未调用数据源。');
    return output;
  }

  const collectSocial = async () => {
    const selected = [...new Set(request.platforms)].filter(platform => RADAR_PLATFORMS.includes(platform));
    if (!selected.length) return;
    const token = config.tikhubToken?.trim();
    if (!token) {
      warnings.add('社媒采集已跳过：未配置 TikHub 凭据。');
      return;
    }
    const overseas = overseasEnabled();
    const channels = selected.filter(platform => {
      if (DOMESTIC.has(platform) || overseas) return true;
      warnings.add(`${platform}: 海外社媒灰度未启用，已跳过。`);
      return false;
    });
    if (!channels.length) return;
    try {
      const result = await new MultiChannelOrchestrator().crawlMultipleChannels({
        keyword: query,
        channels: channels.map(type => ({ type, config: {
          auth_token: token, mode: request.mode,
          // 国内适配器返回整页帖子，但 max_posts 控制评论帖数；海外适配器内置五帖评论上限。
          max_posts: DOMESTIC.has(type) ? commentPostLimit : (quick ? commentPostLimit : postLimit),
          max_comments_per_post: commentLimit,
        } })),
      });
      for (const channel of result.results) {
        if (!channels.some(type => type === channel.channel)) continue;
        const calls = channel.metadata?.api_calls;
        if (typeof calls === 'number' && Number.isFinite(calls) && calls >= 0) output.apiCalls += Math.floor(calls);
        else warnings.add(`${channel.channel}: 调用统计不可用，未估算调用次数。`);
        if (!channel.success) warnings.add(`${channel.channel}: 社媒采集失败或不完整。`);
        const posts = channel.posts.slice(0, postLimit);
        output.postCount += posts.length;
        const urls = new Map<string, string>();
        for (const post of posts) {
          const url = postUrl(post);
          if (!url) {
            warnings.add(`${channel.channel}: 已丢弃缺少安全原始链接的帖子。`);
            continue;
          }
          urls.set(post.post_id, url);
          addEvidence(channel.channel, post.title, post.content, url);
        }
        const commentPosts = new Set(posts.slice(0, commentPostLimit).map(post => post.post_id));
        const perPost = new Map<string, number>();
        for (const comment of channel.comments) {
          const count = perPost.get(comment.post_id) ?? 0;
          if (!commentPosts.has(comment.post_id) || count >= commentLimit) continue;
          perPost.set(comment.post_id, count + 1);
          output.commentCount += 1;
          const url = urls.get(comment.post_id);
          if (!url) {
            warnings.add(`${channel.channel}: 已丢弃缺少父帖安全链接的评论。`);
            continue;
          }
          // 评论与父帖可共享 URL，唯一来源去重交由核心处理。
          addEvidence(channel.channel, '用户评论', comment.content, url);
        }
      }
    } catch {
      warnings.add('社媒采集失败；未返回的调用统计不可用。');
    }
  };

  const collectWeb = async (provider: SearchProvider, key: string | undefined) => {
    if (!key?.trim()) return;
    output.apiCalls += 1;
    try {
      const items = await searchWeb(provider, key.trim(), webQuery, request.country, postLimit);
      for (const item of items) {
        const data = record(item);
        const url = safePublicHttpsUrl(data.url);
        if (!url) {
          warnings.add(`${provider}: 已丢弃缺少安全原始链接的搜索结果。`);
          continue;
        }
        const snippets = Array.isArray(data.snippets) ? data.snippets : [];
        addEvidence(provider, data.title || data.name,
          data.snippet || data.description || data.content || data.summary || snippets[0], url);
      }
    } catch {
      warnings.add(`${provider}: 搜索失败或超时，已跳过；未进行重试。`);
    }
  };

  await Promise.all([
    collectSocial(), collectWeb('bocha', config.bochaApiKey),
    collectWeb('you', config.youApiKey), collectWeb('tavily', config.tavilyApiKey),
  ]);
  output.warnings = [...warnings];
  return output;
}
