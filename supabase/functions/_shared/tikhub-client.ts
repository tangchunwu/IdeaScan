/** TikHub V5.3.2 请求与分页统一入口，所有渠道复用相同的限时、计数和错误规则。 */

export interface TikHubStats {
  apiCalls: number;
  failedCalls: number;
  retries: number;
  rateLimited: boolean;
}

export interface TikHubClientOptions {
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
  maxRequests?: number;
}

export type TikHubErrorKind = 'http' | 'business' | 'timeout' | 'network' | 'invalid_response' | 'auth' | 'budget';
export interface TikHubErrorOptions {
  status?: number;
  retryable?: boolean;
  httpStatus?: number | null;
  businessCode?: number | string;
  kind?: TikHubErrorKind;
  requestId?: string;
  path?: string;
  upstreamMessage?: string;
}

export class TikHubError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  readonly httpStatus: number | null;
  readonly businessCode?: number | string;
  readonly kind: TikHubErrorKind;
  readonly requestId?: string;
  readonly path?: string;
  readonly upstreamMessage?: string;

  constructor(message: string, options: TikHubErrorOptions = {}) {
    super(message);
    this.name = "TikHubError";
    this.status = options.status ?? 0;
    this.retryable = options.retryable ?? false;
    this.kind = options.kind || 'http';
    this.httpStatus = options.httpStatus === undefined ? (this.kind === 'http' ? this.status || null : null) : options.httpStatus;
    this.businessCode = options.businessCode;
    this.requestId = options.requestId;
    this.path = options.path;
    this.upstreamMessage = options.upstreamMessage;
  }
}

export interface XhsSearchPage {
  notes: any[];
  total: number;
  hasMore: boolean;
  searchId: string;
  searchSessionId: string;
}

export interface DouyinSearchPage {
  videos: any[];
  hasMore: boolean;
  pagination: {
    offset: number;
    page: number;
    searchId: string;
    backtrace: string;
  };
}

export interface TikHubPage<T = any> {
  items: T[];
  posts: T[];
  comments: T[];
  hasMore: boolean;
  continuationToken: string;
  after: string;
  offset?: number;
}

export interface TikTokSearchOptions {
  offset?: number;
  count?: number;
  sortType?: number;
  publishTime?: number;
  region?: string;
}

export interface TikTokCommentsOptions {
  cursor?: number;
  count?: number;
}

export interface InstagramSearchOptions {
  mode?: "general" | "reels";
  paginationToken?: string;
}

export interface InstagramCommentsOptions {
  sortBy?: string;
  paginationToken?: string;
}

export interface YouTubeSearchOptions {
  continuationToken?: string;
  uploadDate?: string;
  type?: string;
  duration?: string;
  features?: string;
  sortBy?: string;
}

export interface YouTubeCommentsOptions {
  languageCode?: string;
  countryCode?: string;
  sortBy?: string;
  continuationToken?: string;
  needFormat?: boolean;
}

export interface RedditSearchOptions {
  language?: string;
  searchType?: string;
  sort?: string;
  timeRange?: string;
  safeSearch?: string;
  allowNsfw?: string;
  after?: string;
}

export interface RedditCommentsOptions {
  language?: string;
  sortType?: string;
  after?: string;
}

export interface TwitterSearchOptions { searchType?: string; cursor?: string; }
export interface TwitterCommentsOptions { cursor?: string; }
export interface ThreadsCommentsOptions { endCursor?: string; }

const BASE_URL = "https://api.tikhub.io";
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_BASE_DELAY_MS = 1_200;

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? value as Record<string, any> : {};
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function isTruthyMore(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function unwrapPayload(body: any): Record<string, any> {
  let payload = asRecord(body);
  for (let depth = 0; depth < 3 && payload.data && typeof payload.data === "object" && !Array.isArray(payload.data); depth++) {
    if (["items", "comments", "aweme_list", "pagination"].some((key) => key in payload)) break;
    payload = asRecord(payload.data);
  }
  return payload;
}

function hasUpstreamFailure(body: any): boolean {
  const outer = asRecord(body);
  const first = asRecord(outer.data);
  const second = asRecord(first.data);
  if (outer.success === false || first.success === false || second.success === false) return true;
  if ([outer, first, second].some((layer) =>
    (layer.code !== undefined && ![0, 200].includes(Number(layer.code))) ||
    (layer.status_code !== undefined && Number(layer.status_code) !== 0)
  )) return true;
  const text = [outer.msg, outer.message, first.msg, first.message, second.msg, second.message]
    .filter(Boolean).join(" ").toLowerCase();
  return /服务异常|service error|upstream error|insufficient (?:balance|credits)|quota exceeded|额度不足|余额不足/.test(text);
}

function safeDiagnosticText(value: unknown, token: string): string | undefined {
  if (typeof value !== 'string' || /<\/?(?:html|script|body)\b/i.test(value)) return undefined;
  let output = value;
  for (const secret of [token, encodeURIComponent(token)]) {
    if (secret) output = output.split(secret).join('[REDACTED]');
  }
  output = output.replace(/https?:\/\/[^\s<>"']+/gi, '[URL]')
    .replace(/Bearer\s+[^\s,;"']+/gi, 'Bearer [REDACTED]')
    .replace(/((?:api[_ -]?key|token|authorization|secret|password)\s*[:=]\s*)["']?[^\s,;"']+/gi, '$1[REDACTED]')
    .replace(/[A-Za-z0-9+/_=-]{32,}/g, '[REDACTED]')
    .replace(/\s+/g, ' ').trim();
  // 禁止控制字符进入日志或设置页；仅返回白名单摘要而非原始响应体。
  output = Array.from(output).filter(ch => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127).join('');
  return output.slice(0, 240) || undefined;
}

function upstreamErrorInfo(body: unknown, token: string): Pick<TikHubErrorOptions, 'businessCode' | 'requestId' | 'upstreamMessage'> {
  const root = asRecord(body);
  const layers = [root, asRecord(root.data), asRecord(asRecord(root.data).data)];
  const failed = layers.find(layer => (layer.code !== undefined && ![0, 200].includes(Number(layer.code))) || (layer.status_code !== undefined && Number(layer.status_code) !== 0) || layer.success === false);
  const rawCode = failed?.code ?? failed?.status_code;
  const businessCode = typeof rawCode === 'number' && Number.isFinite(rawCode) ? rawCode
    : typeof rawCode === 'string' && /^-?\d{1,9}$/.test(rawCode) ? rawCode : undefined;
  const rawId = layers.map(layer => layer.request_id || layer.requestId).find(value => typeof value === 'string');
  const requestId = typeof rawId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{3,79}$/.test(rawId) && !rawId.includes(token) ? rawId : undefined;
  const errorLayer = failed || layers.find(layer => layer.message || layer.msg || layer.detail) || {};
  const detail = Array.isArray(errorLayer.detail) ? errorLayer.detail.slice(0, 3).map((item: unknown) => typeof asRecord(item).msg === 'string' ? asRecord(item).msg : '').join('; ') : errorLayer.detail;
  return { businessCode, requestId, upstreamMessage: safeDiagnosticText(errorLayer.message_zh || errorLayer.message || errorLayer.msg || detail, token) };
}

function retryAfterMs(response: Response, fallback: number): number {
  const header = response.headers.get("retry-after");
  if (!header) return fallback;
  const value = Number(header);
  const delay = Number.isFinite(value) ? value * 1_000 : Date.parse(header) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, delay) : fallback;
}

function continuationChanged(previous: Record<string, unknown>, next: Record<string, unknown>): boolean {
  return ["cursor", "index", "pageArea"].some((key) => String(previous[key] ?? "") !== String(next[key] ?? ""));
}

function findArrayResult(value: unknown, keys: string[], depth = 0): { found: boolean; value: any[] } {
  if (depth > 4 || value === null || value === undefined) return { found: false, value: [] };
  if (Array.isArray(value)) return { found: true, value };
  if (typeof value !== "object") return { found: false, value: [] };
  const record = asRecord(value);
  for (const key of keys) {
    if (Array.isArray(record[key])) return { found: true, value: record[key] };
  }
  for (const key of ["data", "payload", "result", "results"]) {
    if (record[key] !== undefined) {
      const nested = findArrayResult(record[key], keys, depth + 1);
      if (nested.found) return nested;
    }
  }
  return { found: false, value: [] };
}

function findFirstValue(value: unknown, keys: string[], depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return undefined;
  const record = asRecord(value);
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  for (const key of ["data", "payload", "result", "results", "pagination", "pageInfo", "page_info"]) {
    if (record[key] !== undefined) {
      const nested = findFirstValue(record[key], keys, depth + 1);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

function pageHasMore(payload: Record<string, any>, continuationToken = "", after = ""): boolean {
  const value = findFirstValue(payload, ["has_more", "hasMore", "has_next", "hasNext", "hasNextPage"]);
  if (value !== undefined) return isTruthyMore(value);
  return Boolean(continuationToken || after);
}

function pageToken(payload: Record<string, any>, keys: string[]): string {
  const value = findFirstValue(payload, keys);
  return value === undefined || value === null ? "" : String(value);
}

export class TikHubClient {
  readonly stats: TikHubStats = { apiCalls: 0, failedCalls: 0, retries: 0, rateLimited: false };
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly signal?: AbortSignal;
  private readonly maxRequests: number;
  private lastPath = '';

  constructor(token: string, options: TikHubClientOptions = {}) {
    if (!String(token || "").trim()) throw new TikHubError("TikHub token is required", { status: 401, kind: 'auth', httpStatus: null });
    this.token = token;
    const timeout = Number(options.timeoutMs);
    const retries = Number(options.maxRetries ?? DEFAULT_MAX_RETRIES);
    const delay = Number(options.baseDelayMs);
    this.timeoutMs = Number.isFinite(timeout) && timeout > 0 ? Math.max(1, Math.min(60_000, timeout)) : DEFAULT_TIMEOUT_MS;
    this.maxRetries = Number.isFinite(retries) ? Math.max(0, Math.min(2, Math.trunc(retries))) : DEFAULT_MAX_RETRIES;
    this.baseDelayMs = Number.isFinite(delay) && delay > 0 ? Math.min(10_000, delay) : DEFAULT_BASE_DELAY_MS;
    this.signal = options.signal;
    this.maxRequests = Number.isFinite(options.maxRequests) ? Math.max(0, Math.trunc(options.maxRequests!)) : Infinity;
  }

  private async request(path: string, init: RequestInit = {}): Promise<any> {
    const url = `${BASE_URL}${path}`;
    const requestPath = path.split('?')[0];
    this.lastPath = requestPath;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (this.signal?.aborted || this.stats.apiCalls >= this.maxRequests) throw new TikHubError('TikHub diagnostic deadline or request budget reached', { kind: 'budget', httpStatus: null, path: requestPath });
      this.stats.apiCalls += 1;
      const controller = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => { timedOut = true; controller.abort(new DOMException("TikHub timeout", "TimeoutError")); }, this.timeoutMs);
      const cancel = () => controller.abort(this.signal?.reason);
      this.signal?.addEventListener('abort', cancel, { once: true });
      try {
        const response = await fetch(url, {
          ...init,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.token}`,
            ...(init.headers || {}),
          },
          signal: controller.signal,
          redirect: 'error',
        });
        const bodyText = await response.text();
        clearTimeout(timeout);
        let body: any = null;
        try { body = bodyText ? JSON.parse(bodyText) : null; } catch {
          body = null;
        }

        if (response.ok && body && !hasUpstreamFailure(body)) return body;

        const info = upstreamErrorInfo(body, this.token);
        const effectiveStatus = info.businessCode !== undefined && Number(info.businessCode) >= 100 && Number(info.businessCode) <= 599 ? Number(info.businessCode) : response.status;
        const retryable = ![401, 402, 403, 422].includes(effectiveStatus) && !hasUpstreamFailure(body) && isRetryableStatus(response.status);
        this.stats.failedCalls += 1;
        if (effectiveStatus === 429 || response.status === 429) this.stats.rateLimited = true;
        if (!retryable || attempt >= this.maxRetries) {
          const kind: TikHubErrorKind = !response.ok ? 'http' : hasUpstreamFailure(body) ? 'business' : 'invalid_response';
          throw new TikHubError(
            `TikHub ${kind} error (HTTP ${response.status}${info.businessCode !== undefined ? `, code ${info.businessCode}` : ''})${info.upstreamMessage ? `: ${info.upstreamMessage}` : ''}`,
            { status: effectiveStatus, httpStatus: response.status, kind, ...info, path: requestPath, retryable: false },
          );
        }

        const delay = retryAfterMs(response, Math.min(30_000, this.baseDelayMs * (2 ** attempt)));
        // 超长限流不提前重试，交给用户稍后再试，避免同一次验证持续刷费。
        if (delay > 30_000) throw new TikHubError("TikHub rate limit; retry later", { status: 429, httpStatus: response.status, kind: 'http', path: requestPath, ...info });
        this.stats.retries += 1;
        await new Promise((resolve) => setTimeout(resolve, delay));
      } catch (error) {
        clearTimeout(timeout);
        if (error instanceof TikHubError) throw error;
        this.stats.failedCalls += 1;
        if (this.signal?.aborted) throw new TikHubError('TikHub diagnostic deadline reached', { kind: 'budget', httpStatus: null, path: requestPath });
        if (attempt >= this.maxRetries) {
          throw new TikHubError(timedOut ? 'TikHub request timed out' : 'TikHub network connection failed', { status: timedOut ? 408 : 0, httpStatus: null, kind: timedOut ? 'timeout' : 'network', path: requestPath, retryable: false });
        }
        this.stats.retries += 1;
        await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, this.baseDelayMs * (2 ** attempt))));
      } finally {
        clearTimeout(timeout);
        this.signal?.removeEventListener('abort', cancel);
      }
    }
    throw new TikHubError("TikHub request failed", { retryable: false });
  }

  async getUserInfo(): Promise<Record<string, unknown>> {
    return asRecord(await this.request('/api/v1/tikhub/user/get_user_info'));
  }

  async searchXhs(keyword: string, options: {
    page?: number;
    sortType?: string;
    noteType?: string;
    timeFilter?: string;
    searchId?: string;
    searchSessionId?: string;
  } = {}): Promise<XhsSearchPage> {
    const params = new URLSearchParams({
      keyword,
      page: String(options.page || 1),
      sort_type: options.sortType || "general",
      note_type: options.noteType || "不限",
      time_filter: options.timeFilter || "不限",
      search_id: options.searchId || "",
      search_session_id: options.searchSessionId || "",
      source: "explore_feed",
      ai_mode: "0",
    });
    const payload = unwrapPayload(await this.request(`/api/v1/xiaohongshu/app_v2/search_notes?${params}`));
    this.requireArray(payload, "items");
    const notes = asArray(payload.items).map((item) => asRecord(item).note || item)
      .filter((note) => String(note?.id || note?.note_id || ""));
    const pagination = asRecord(payload.pagination);
    return {
      notes: Array.from(new Map(notes.map((note) => [String(note.id || note.note_id), note])).values()),
      total: Number(payload.total || payload.total_count || notes.length),
      hasMore: isTruthyMore(payload.has_more ?? pagination.has_more),
      searchId: String(payload.search_id || pagination.search_id || ""),
      searchSessionId: String(payload.search_session_id || pagination.search_session_id || ""),
    };
  }

  async getXhsComments(noteId: string, limit = 20): Promise<any[]> {
    if (!noteId || limit <= 0) return [];
    const comments: any[] = [];
    const seen = new Set<string>();
    let state: Record<string, any> = { cursor: "", index: 0, pageArea: "UNFOLDED" };
    for (let page = 0; page < 5 && comments.length < limit; page++) {
      const params = new URLSearchParams({ note_id: noteId, cursor: state.cursor, index: String(state.index), pageArea: state.pageArea, sort_strategy: "latest_v2" });
      const payload = unwrapPayload(await this.request(`/api/v1/xiaohongshu/app_v2/get_note_comments?${params}`));
      this.requireArray(payload, "comments");
      for (const comment of asArray(payload.comments)) {
        const id = String(comment?.id || comment?.comment_id || "");
        if (id && !seen.has(id)) { seen.add(id); comments.push(comment); }
        if (comments.length >= limit) break;
      }
      const next = { cursor: String(payload.cursor || ""), index: Number(payload.index || 0), pageArea: String(payload.pageArea || "UNFOLDED") };
      if (!isTruthyMore(payload.has_more) || !continuationChanged(state, next)) break;
      state = next;
    }
    return comments.slice(0, limit);
  }

  async getXhsCommentsFirstPage(noteId: string, limit = 1): Promise<unknown[]> {
    if (!noteId || limit <= 0) return [];
    const params = new URLSearchParams({ note_id: noteId, cursor: '', index: '0', pageArea: 'UNFOLDED', sort_strategy: 'latest_v2' });
    const payload = unwrapPayload(await this.request(`/api/v1/xiaohongshu/app_v2/get_note_comments?${params}`));
    this.requireArray(payload, 'comments');
    return asArray(payload.comments).slice(0, limit);
  }

  async searchDouyin(keyword: string, pagination: Partial<DouyinSearchPage["pagination"]> = {}): Promise<DouyinSearchPage> {
    const page = Number(pagination.page || 1);
    const body = { keyword, offset: Number(pagination.offset || 0), page, search_id: String(pagination.searchId || ""), backtrace: String(pagination.backtrace || "") };
    const payload = unwrapPayload(await this.request("/api/v1/douyin/search/fetch_video_search_v5", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    this.requireArray(payload, "items");
    const pageInfo = asRecord(payload.pagination);
    const videos = asArray(payload.items).map((item) => asRecord(item).aweme_info || item).filter((item) => String(item?.aweme_id || ""));
    return {
      videos,
      hasMore: isTruthyMore(pageInfo.has_more),
      pagination: {
        offset: Number(pageInfo.offset ?? pageInfo.cursor ?? body.offset),
        page: Number(pageInfo.next_page ?? page),
        searchId: String(pageInfo.search_id || body.search_id),
        backtrace: String(pageInfo.backtrace || body.backtrace),
      },
    };
  }

  async getDouyinComments(awemeId: string, limit = 20): Promise<any[]> {
    if (!awemeId || limit <= 0) return [];
    // TiKHub 文档要求抖音评论保持默认 count=20；即使调用方只需要一条，
    // 也必须先请求默认页大小，再在本地截断，否则 Web 路由会返回 400。
    const upstreamCount = 20;
    const params = new URLSearchParams({ aweme_id: awemeId, cursor: "0", count: String(upstreamCount) });
    const payload = unwrapPayload(await this.request(`/api/v1/douyin/app/v3/fetch_video_comments?${params}`));
    const result = findArrayResult(payload, ["comments", "comment_list", "commentList", "items", "data"]);
    if (!result.found && Object.prototype.hasOwnProperty.call(payload, "comments") && payload.comments == null) return [];
    this.requireFoundArray(result, "comments");
    return result.value.slice(0, limit);
  }

  async searchTikTok(keyword: string, options: TikTokSearchOptions = {}): Promise<TikHubPage> {
    const params = new URLSearchParams({
      keyword,
      offset: String(options.offset ?? 0),
      count: String(options.count ?? 20),
      sort_type: String(options.sortType ?? 0),
      publish_time: String(options.publishTime ?? 0),
      region: options.region || "US",
    });
    const payload = unwrapPayload(await this.request(`/api/v1/tiktok/app/v3/fetch_video_search_result?${params}`));
    const result = findArrayResult(payload, ['search_item_list', "items", "aweme_list", "item_list", "videos", "data"]);
    this.requireFoundArray(result, "items");
    const items = result.value.map(item => asRecord(item).aweme_info || item).filter(item => String(item?.aweme_id || item?.id || item?.video_id || ''));
    const uniqueItems = Array.from(new Map(items.map(item => [String(item.aweme_id || item.id || item.video_id), item])).values());
    const nextCursor = pageToken(payload, ["next_cursor", "nextCursor"]);
    const nextOffset = pageToken(payload, ["next_offset", "nextOffset", 'cursor']);
    const offset = nextOffset !== '' && Number.isFinite(Number(nextOffset)) && Number(nextOffset) >= 0 ? Number(nextOffset) : undefined;
    return this.searchPage(uniqueItems, payload, nextCursor, "", offset);
  }

  async getTikTokComments(awemeId: string, limit?: number): Promise<any[]>;
  async getTikTokComments(awemeId: string, options: TikTokCommentsOptions): Promise<TikHubPage>;
  async getTikTokComments(awemeId: string, limitOrOptions: number | TikTokCommentsOptions = 10): Promise<any[] | TikHubPage> {
    const options: TikTokCommentsOptions = typeof limitOrOptions === "number" ? { count: limitOrOptions } : limitOrOptions;
    const limit = options.count ?? 10;
    if (!awemeId || limit <= 0) return typeof limitOrOptions === "number" ? [] : this.emptyCommentPage();
    const params = new URLSearchParams({ aweme_id: awemeId, cursor: String(options.cursor ?? 0), count: String(Math.min(50, limit)) });
    const payload = unwrapPayload(await this.request(`/api/v1/tiktok/app/v3/fetch_video_comments?${params}`));
    const result = findArrayResult(payload, ["comments", "comment_list", "items", "data"]);
    this.requireFoundArray(result, "comments");
    const comments = result.value.slice(0, limit);
    if (typeof limitOrOptions !== "number") {
      return this.commentPage(comments, payload, pageToken(payload, ["next_cursor", "nextCursor"]), "");
    }
    return comments;
  }

  async searchInstagram(keyword: string, options: InstagramSearchOptions = { mode: "general" }): Promise<TikHubPage> {
    const path = options.mode === "reels" ? "/api/v1/instagram/v2/search_reels" : "/api/v1/instagram/v2/general_search";
    const params = new URLSearchParams({ keyword });
    if (options.paginationToken !== undefined) params.set("pagination_token", options.paginationToken);
    const payload = unwrapPayload(await this.request(`${path}?${params}`));
    const result = findArrayResult(payload, ["items", "posts", "medias", "reels", "results", "data"]);
    this.requireFoundArray(result, "items");
    const continuationToken = pageToken(payload, ["next_pagination_token", "nextPaginationToken", "pagination_token", "paginationToken"]);
    return this.searchPage(result.value, payload, continuationToken, "");
  }

  async getInstagramComments(codeOrUrl: string, limit?: number, paginationToken?: string): Promise<any[]>;
  async getInstagramComments(codeOrUrl: string, options: InstagramCommentsOptions): Promise<TikHubPage>;
  async getInstagramComments(codeOrUrl: string, limitOrOptions: number | InstagramCommentsOptions = 10, paginationToken?: string): Promise<any[] | TikHubPage> {
    const options: InstagramCommentsOptions = typeof limitOrOptions === "number" ? { paginationToken } : limitOrOptions;
    const limit = typeof limitOrOptions === "number" ? limitOrOptions : 10;
    if (!codeOrUrl || limit <= 0) return typeof limitOrOptions === "number" ? [] : this.emptyCommentPage();
    const params = new URLSearchParams({ code_or_url: codeOrUrl });
    if (options.sortBy) params.set("sort_by", options.sortBy);
    if (options.paginationToken !== undefined) params.set("pagination_token", options.paginationToken);
    const payload = unwrapPayload(await this.request(`/api/v1/instagram/v2/fetch_post_comments?${params}`));
    const result = findArrayResult(payload, ["comments", "items", "data"]);
    this.requireFoundArray(result, "comments");
    const comments = result.value.slice(0, limit);
    if (typeof limitOrOptions !== "number") {
      return this.commentPage(comments, payload, pageToken(payload, ["next_pagination_token", "nextPaginationToken", "pagination_token", "paginationToken"]), "");
    }
    return comments;
  }

  async searchYouTube(keyword: string, options: YouTubeSearchOptions = {}): Promise<TikHubPage> {
    const params = new URLSearchParams();
    if (keyword) params.set("keyword", keyword);
    if (options.continuationToken !== undefined) params.set("continuation_token", options.continuationToken);
    if (options.uploadDate) params.set("upload_date", options.uploadDate);
    if (options.type) params.set("type", options.type);
    if (options.duration) params.set("duration", options.duration);
    if (options.features) params.set("features", options.features);
    if (options.sortBy) params.set("sort_by", options.sortBy);
    const payload = unwrapPayload(await this.request(`/api/v1/youtube/web_v2/get_general_search_v2?${params}`));
    const result = findArrayResult(payload, ["items", "videos", "shorts", "contents", "results", "data"]);
    this.requireFoundArray(result, "items");
    const continuationToken = pageToken(payload, ["next_continuation_token", "nextContinuationToken", "continuation_token", "continuationToken"]);
    return this.searchPage(result.value, payload, continuationToken, "");
  }

  async getYouTubeComments(videoId: string, limit?: number, continuationToken?: string): Promise<any[]>;
  async getYouTubeComments(videoId: string, options: YouTubeCommentsOptions): Promise<TikHubPage>;
  async getYouTubeComments(videoId: string, limitOrOptions: number | YouTubeCommentsOptions = 10, continuationToken?: string): Promise<any[] | TikHubPage> {
    const options: YouTubeCommentsOptions = typeof limitOrOptions === "number" ? { continuationToken } : limitOrOptions;
    const limit = typeof limitOrOptions === "number" ? limitOrOptions : 10;
    if (!videoId || limit <= 0) return typeof limitOrOptions === "number" ? [] : this.emptyCommentPage();
    const params = new URLSearchParams({ video_id: videoId });
    if (options.languageCode) params.set("language_code", options.languageCode);
    if (options.countryCode) params.set("country_code", options.countryCode);
    if (options.sortBy) params.set("sort_by", options.sortBy);
    if (options.continuationToken !== undefined) params.set("continuation_token", options.continuationToken);
    if (options.needFormat !== undefined) params.set("need_format", String(options.needFormat));
    const payload = unwrapPayload(await this.request(`/api/v1/youtube/web_v2/get_video_comments?${params}`));
    const result = findArrayResult(payload, ["comments", "items", "comment_items", "data"]);
    this.requireFoundArray(result, "comments");
    const comments = result.value.slice(0, limit);
    if (typeof limitOrOptions !== "number") {
      return this.commentPage(comments, payload, pageToken(payload, ["next_continuation_token", "nextContinuationToken", "continuation_token", "continuationToken"]), "");
    }
    return comments;
  }

  async searchReddit(keyword: string, options: RedditSearchOptions = {}): Promise<TikHubPage> {
    const params = new URLSearchParams({ query: keyword, search_type: options.searchType || "post", safe_search: options.safeSearch || "unset", allow_nsfw: options.allowNsfw || "0", need_format: "true" });
    if (options.language) params.set("language", options.language);
    if (options.sort) params.set("sort", options.sort);
    if (options.timeRange) params.set("time_range", options.timeRange);
    if (options.after !== undefined) params.set("after", options.after);
    const payload = unwrapPayload(await this.request(`/api/v1/reddit/app/fetch_dynamic_search?${params}`));
    const result = findArrayResult(payload, ["posts", "items", "children", "results", "data"]);
    this.requireFoundArray(result, "posts");
    const after = pageToken(payload, ["end_cursor", "endCursor", "next_after", "nextAfter", "after"]);
    return this.searchPage(result.value, payload, "", after);
  }

  async getRedditComments(postId: string, limit?: number, after?: string): Promise<any[]>;
  async getRedditComments(postId: string, options: RedditCommentsOptions): Promise<TikHubPage>;
  async getRedditComments(postId: string, limitOrOptions: number | RedditCommentsOptions = 10, after?: string): Promise<any[] | TikHubPage> {
    const options: RedditCommentsOptions = typeof limitOrOptions === "number" ? { after } : limitOrOptions;
    const limit = typeof limitOrOptions === "number" ? limitOrOptions : 10;
    if (!postId || limit <= 0) return typeof limitOrOptions === "number" ? [] : this.emptyCommentPage();
    const params = new URLSearchParams({ post_id: postId, need_format: "true" });
    if (options.language) params.set("language", options.language);
    if (options.sortType) params.set("sort_type", options.sortType);
    if (options.after !== undefined) params.set("after", options.after);
    const payload = unwrapPayload(await this.request(`/api/v1/reddit/app/fetch_post_comments?${params}`));
    const forest = asRecord(payload.commentForest || asRecord(payload.postInfoById).commentForest);
    const trees = asArray(forest.trees);
    const result = trees.length > 0
      ? { found: true, value: trees.map(tree => asRecord(tree).node || tree) }
      : findArrayResult(payload, ["comments", "items", "children", "data"]);
    this.requireFoundArray(result, "comments");
    const comments = result.value.slice(0, limit);
    if (typeof limitOrOptions !== "number") {
      const nextAfter = pageToken(forest, ["end_cursor", "endCursor", "next_after", "nextAfter", "after"])
        || pageToken(payload, ["end_cursor", "endCursor", "next_after", "nextAfter", "after"]);
      return this.commentPage(comments, payload, "", nextAfter);
    }
    return comments;
  }

  async searchTwitter(keyword: string, options: TwitterSearchOptions = {}): Promise<TikHubPage> {
    const params = new URLSearchParams({ keyword, search_type: options.searchType || "Top", cursor: options.cursor || "" });
    const payload = unwrapPayload(await this.request(`/api/v1/twitter/web/fetch_search_timeline?${params}`));
    const result = findArrayResult(payload, ["timeline", "tweets", "items", "results", "data"]);
    this.requireFoundArray(result, "timeline");
    const items = result.value.filter(item => asRecord(item).type === undefined || asRecord(item).type === "tweet");
    return this.searchPage(items, payload, pageToken(payload, ["next_cursor", "nextCursor"]), "");
  }

  async getTwitterComments(tweetId: string, limit?: number, cursor?: string): Promise<any[]>;
  async getTwitterComments(tweetId: string, options: TwitterCommentsOptions): Promise<TikHubPage>;
  async getTwitterComments(tweetId: string, limitOrOptions: number | TwitterCommentsOptions = 10, cursor?: string): Promise<any[] | TikHubPage> {
    const options: TwitterCommentsOptions = typeof limitOrOptions === "number" ? { cursor } : limitOrOptions;
    const limit = typeof limitOrOptions === "number" ? limitOrOptions : 10;
    if (!tweetId || limit <= 0) return typeof limitOrOptions === "number" ? [] : this.emptyCommentPage();
    const params = new URLSearchParams({ tweet_id: tweetId, cursor: options.cursor || "" });
    const payload = unwrapPayload(await this.request(`/api/v1/twitter/web/fetch_post_comments?${params}`));
    const result = findArrayResult(payload, ["comments", "items", "replies", "data"]);
    this.requireFoundArray(result, "comments");
    const comments = result.value.slice(0, limit);
    if (typeof limitOrOptions !== "number") return this.commentPage(comments, payload, pageToken(payload, ["next_cursor", "nextCursor"]), "");
    return comments;
  }

  async searchThreads(keyword: string): Promise<TikHubPage> {
    const params = new URLSearchParams({ query: keyword });
    const payload = unwrapPayload(await this.request(`/api/v1/threads/web/search_posts?${params}`));
    const results = findArrayResult(payload, ["results"]);
    this.requireFoundArray(results, "results");
    const posts = results.value.map(item => {
      const root = asRecord(item);
      const node = asRecord(asRecord(root.node).thread);
      const first = asRecord(asArray(node.thread_items)[0]);
      return first.post || root.post || item;
    }).filter(Boolean);
    return this.searchPage(posts, payload, pageToken(payload, ["cursor", "next_cursor"]), "");
  }

  async getThreadsComments(postId: string, limit?: number, endCursor?: string): Promise<any[]>;
  async getThreadsComments(postId: string, options: ThreadsCommentsOptions): Promise<TikHubPage>;
  async getThreadsComments(postId: string, limitOrOptions: number | ThreadsCommentsOptions = 10, endCursor?: string): Promise<any[] | TikHubPage> {
    const options: ThreadsCommentsOptions = typeof limitOrOptions === "number" ? { endCursor } : limitOrOptions;
    const limit = typeof limitOrOptions === "number" ? limitOrOptions : 10;
    if (!postId || limit <= 0) return typeof limitOrOptions === "number" ? [] : this.emptyCommentPage();
    const params = new URLSearchParams({ post_id: postId, end_cursor: options.endCursor || "" });
    const payload = unwrapPayload(await this.request(`/api/v1/threads/web/fetch_post_comments?${params}`));
    const result = findArrayResult(payload, ["comments", "items", "replies", "data"]);
    this.requireFoundArray(result, "comments");
    const comments = result.value.slice(0, limit);
    if (typeof limitOrOptions !== "number") return this.commentPage(comments, payload, "", "");
    return comments;
  }

  private searchPage(items: any[], payload: Record<string, any>, continuationToken: string, after: string, offset?: number): TikHubPage {
    return {
      items,
      posts: items,
      comments: [],
      hasMore: pageHasMore(payload, continuationToken, after),
      continuationToken,
      after,
      ...(offset === undefined ? {} : { offset }),
    };
  }

  private emptyCommentPage(): TikHubPage {
    return { items: [], posts: [], comments: [], hasMore: false, continuationToken: "", after: "" };
  }

  private commentPage(comments: any[], payload: Record<string, any>, continuationToken: string, after: string): TikHubPage {
    return {
      items: comments,
      posts: [],
      comments,
      hasMore: pageHasMore(payload, continuationToken, after),
      continuationToken,
      after,
    };
  }

  private requireFoundArray(result: { found: boolean; value: any[] }, key: string): void {
    if (result.found) return;
    this.stats.failedCalls += 1;
    throw new TikHubError(`TikHub invalid response: missing ${key}`, { status: 200, httpStatus: 200, kind: 'invalid_response', path: this.lastPath });
  }

  private requireArray(payload: Record<string, any>, key: string): void {
    if (Array.isArray(payload[key])) return;
    // 返回结构变动或上游服务异常不等于成功的空样本，也不能盲目重试付费请求。
    this.stats.failedCalls += 1;
    throw new TikHubError(`TikHub invalid response: missing ${key}`, { status: 200, httpStatus: 200, kind: 'invalid_response', path: this.lastPath });
  }
}

