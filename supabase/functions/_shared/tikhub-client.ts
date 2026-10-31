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
}

export class TikHubError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, options: { status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = "TikHubError";
    this.status = options.status ?? 0;
    this.retryable = options.retryable ?? false;
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
  for (let depth = 0; depth < 3 && payload.data && typeof payload.data === "object"; depth++) {
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
  return text.includes("服务异常") || text.includes("service error") || text.includes("upstream error");
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

export class TikHubClient {
  readonly stats: TikHubStats = { apiCalls: 0, failedCalls: 0, retries: 0, rateLimited: false };
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;

  constructor(token: string, options: TikHubClientOptions = {}) {
    if (!String(token || "").trim()) throw new TikHubError("TikHub token is required", { status: 401 });
    this.token = token;
    const timeout = Number(options.timeoutMs);
    const retries = Number(options.maxRetries ?? DEFAULT_MAX_RETRIES);
    const delay = Number(options.baseDelayMs);
    this.timeoutMs = Number.isFinite(timeout) && timeout > 0 ? Math.max(30_000, Math.min(60_000, timeout)) : DEFAULT_TIMEOUT_MS;
    this.maxRetries = Number.isFinite(retries) ? Math.max(0, Math.min(2, Math.trunc(retries))) : DEFAULT_MAX_RETRIES;
    this.baseDelayMs = Number.isFinite(delay) && delay > 0 ? Math.min(10_000, delay) : DEFAULT_BASE_DELAY_MS;
  }

  private async request(path: string, init: RequestInit = {}): Promise<any> {
    const url = `${BASE_URL}${path}`;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      this.stats.apiCalls += 1;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new DOMException("TikHub timeout", "TimeoutError")), this.timeoutMs);
      try {
        const response = await fetch(url, {
          ...init,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.token}`,
            ...(init.headers || {}),
          },
          signal: controller.signal,
        });
        const bodyText = await response.text();
        clearTimeout(timeout);
        let body: any = null;
        try { body = bodyText ? JSON.parse(bodyText) : null; } catch {
          body = null;
        }

        if (response.ok && body && !hasUpstreamFailure(body)) return body;

        const retryable = isRetryableStatus(response.status);
        this.stats.failedCalls += 1;
        if (response.status === 429) this.stats.rateLimited = true;
        if (!retryable || attempt >= this.maxRetries) {
          throw new TikHubError(
            `TikHub request failed (${response.status || "invalid response"})`,
            { status: response.status, retryable: false },
          );
        }

        const delay = retryAfterMs(response, Math.min(30_000, this.baseDelayMs * (2 ** attempt)));
        // 超长限流不提前重试，交给用户稍后再试，避免同一次验证持续刷费。
        if (delay > 30_000) throw new TikHubError("TikHub rate limit; retry later", { status: 429 });
        this.stats.retries += 1;
        await new Promise((resolve) => setTimeout(resolve, delay));
      } catch (error) {
        clearTimeout(timeout);
        if (error instanceof TikHubError) throw error;
        this.stats.failedCalls += 1;
        if (attempt >= this.maxRetries) {
          throw new TikHubError("TikHub request timed out or failed", { status: 408, retryable: false });
        }
        this.stats.retries += 1;
        await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, this.baseDelayMs * (2 ** attempt))));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new TikHubError("TikHub request failed", { retryable: false });
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
    const params = new URLSearchParams({ aweme_id: awemeId, cursor: "0", count: String(Math.min(50, limit)) });
    const payload = unwrapPayload(await this.request(`/api/v1/douyin/web/fetch_video_comments?${params}`));
    this.requireArray(payload, "comments");
    return asArray(payload.comments).slice(0, limit);
  }

  private requireArray(payload: Record<string, any>, key: string): void {
    if (Array.isArray(payload[key])) return;
    // 返回结构变动或上游服务异常不等于成功的空样本，也不能盲目重试付费请求。
    this.stats.failedCalls += 1;
    throw new TikHubError(`TikHub invalid response: missing ${key}`, { status: 200 });
  }
}

