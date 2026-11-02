import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpportunityRequest, OpportunityResult } from '@/types/opportunity';
import type { OpportunityConfig } from '@/lib/opportunityRadar';

const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'account-a' } as { id: string } | null, isLoading: false },
  settings: {} as Record<string, string>,
  getSession: vi.fn(), getUser: vi.fn(), fetch: vi.fn(),
  listeners: new Set<(event: string, session: { user: { id: string } } | null) => void>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {
  getSession: mocks.getSession, getUser: mocks.getUser,
  onAuthStateChange: (listener: (event: string, session: { user: { id: string } } | null) => void) => {
    mocks.listeners.add(listener);
    return { data: { subscription: { unsubscribe: () => mocks.listeners.delete(listener) } } };
  },
} } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/hooks/useSettings', () => ({ useSettings: () => mocks.settings }));
vi.mock('@/hooks/useSkinToast', () => ({ useSkinToast: () => mocks.toast }));
vi.mock('@/hooks/useDocumentTitle', () => ({ useDocumentTitle: vi.fn() }));
vi.mock('@/components/shared', async () => {
  const { PageBackground } = await vi.importActual<typeof import('@/components/shared/PageBackground')>('@/components/shared/PageBackground');
  const { GlassCard } = await vi.importActual<typeof import('@/components/shared/GlassCard')>('@/components/shared/GlassCard');
  return {
    PageBackground, GlassCard, Navbar: () => <nav aria-label="主导航" />,
    SettingsDialog: ({ open }: { open?: boolean }) => open ? <div role="dialog">API 设置</div> : null,
  };
});

import OpportunityRadar from '@/pages/OpportunityRadar';
import { discoverOpportunities, serializeOpportunityResult } from '@/lib/opportunityRadar';
import { useTheme, type Skin } from '@/hooks/useTheme';

const request: OpportunityRequest = { country: 'United States', industry: '宠物护理', keyword: '预约', platforms: [], mode: 'quick' };
const config: OpportunityConfig = {
  llmBaseUrl: 'https://model.example/v1', llmApiKey: 'memory-model-key', llmModel: 'custom-model',
  tikhubToken: 'memory-social-key', bochaApiKey: 'memory-search-key', youApiKey: '', tavilyApiKey: '',
};
function fixture(): OpportunityResult {
  return {
    schemaVersion: 1, fetchedAt: '2026-11-02T07:00:00Z', request: { ...request, platforms: ['reddit'] },
    stats: { sourceCount: 2, postCount: 7, commentCount: 13, apiCalls: 4, durationMs: 2300 },
    warnings: ['部分平台样本不足'],
    candidates: [{
      id: 'c1', title: '宠物预约协同', problem: '多门店预约分散', targetUsers: '宠物店店主', urgency: 'medium',
      evidenceCount: 1, competitionHint: '需进一步核实竞品', recommendedNextStep: '访谈店主', risks: ['付费意愿未验证'], kind: 'hypothesis',
      evidence: [{ id: 'e1', platform: 'reddit', title: '预约问题原帖', snippet: '原文：多个预约工具无法同步。', url: 'https://example.com/original', collectedAt: '2026-11-02T06:59:00Z', kind: 'fact' }],
    }],
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const run = (input = request, settings = config, signal?: AbortSignal) => discoverOpportunities(input, settings, { signal, expectedUserId: 'account-a' });
function emitIdentity(id: string | null) {
  for (const listener of [...mocks.listeners]) listener(id ? 'SIGNED_IN' : 'SIGNED_OUT', id ? { user: { id } } : null);
}
function Destination() { const location = useLocation(); return <div data-testid="destination">{location.pathname + location.search}</div>; }
function Page() {
  return <MemoryRouter initialEntries={['/opportunities']}><Routes><Route path="/opportunities" element={<OpportunityRadar />} /><Route path="/validate" element={<Destination />} /></Routes></MemoryRouter>;
}
async function submit() {
  fireEvent.change(screen.getByLabelText('行业'), { target: { value: '宠物护理' } });
  fireEvent.click(screen.getByRole('button', { name: '发现商机' }));
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mocks.fetch);
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.example');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'public-key');
  mocks.auth.user = { id: 'account-a' };
  mocks.auth.isLoading = false;
  mocks.settings = { ...config };
  mocks.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'session-token', user: { id: 'account-a' } } }, error: null });
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'account-a' } }, error: null });
  mocks.fetch.mockReset().mockResolvedValue(response(fixture()));
});
afterEach(() => {
  cleanup();
  mocks.listeners.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('opportunity service', () => {
  it('verifies session and user, sends only request/config fields with Bearer, apikey and AbortSignal', async () => {
    const result = await run(request, { ...config, imageGenApiKey: 'unrelated-secret' } as OpportunityConfig);
    expect(mocks.getUser).toHaveBeenCalledWith('session-token');
    const [url, options] = mocks.fetch.mock.calls[0];
    expect(url).toBe('https://project.example/functions/v1/opportunity-discover');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer session-token', apikey: 'public-key' });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options.body)).toEqual({ ...request, config });
    expect(result.stats.commentCount).toBe(13);
    expect(mocks.listeners.size).toBe(0);
  });

  it('permits empty in-memory keys and no social platforms for server pool/env fallback', async () => {
    const empty = Object.fromEntries(Object.keys(config).map(key => [key, ''])) as OpportunityConfig;
    await run(request, empty);
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({ ...request, config: empty });
  });

  it.each(['missing-session', 'invalid-user', 'different-account'])('does not invoke discovery with %s', async scenario => {
    if (scenario === 'missing-session') mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    else mocks.getUser.mockResolvedValue({ data: { user: scenario === 'invalid-user' ? null : { id: 'account-b' } }, error: null });
    await expect(run()).rejects.toMatchObject({ code: 'auth' });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('enforces country max80 before any paid request', async () => {
    await expect(run({ ...request, country: 'a'.repeat(81) })).rejects.toMatchObject({ code: 'request' });
    expect(mocks.fetch).not.toHaveBeenCalled();
    await run({ ...request, country: 'a'.repeat(80) });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('preserves safe 400 allowlist details and limits their length', async () => {
    mocks.fetch.mockResolvedValue(response({ error: '自定义模型地址不在 allowlist 中。' + 'x'.repeat(400) }, 400));
    await expect(run()).rejects.toMatchObject({ code: 'config', message: ('自定义模型地址不在 allowlist 中。' + 'x'.repeat(400)).slice(0, 240) });
  });

  it('does not echo arbitrary upstream failures or accept malformed statistics', async () => {
    mocks.fetch.mockResolvedValueOnce(response({ error: 'private upstream secret' }, 502));
    await expect(run()).rejects.toThrow('HTTP 502');
    mocks.fetch.mockResolvedValueOnce(response({ ...fixture(), stats: { ...fixture().stats, apiCalls: 'invented' } }));
    await expect(run()).rejects.toMatchObject({ code: 'response', message: '服务返回的结果格式不完整，请重试。' });
  });

  it('only retains HTTPS evidence URLs and strips config at every export level', async () => {
    const raw = fixture();
    raw.candidates[0].evidence = ['http://example.com', 'javascript:alert(1)', 'https://user:pass@example.com', 'https://example.com/safe'].map((url, i) => ({ ...raw.candidates[0].evidence[0], id: String(i), url }));
    mocks.fetch.mockResolvedValue(response({ ...raw, config, request: { ...raw.request, config } }));
    const result = await run();
    expect(result.candidates[0].evidence.map(e => e.url)).toEqual(['', '', '', 'https://example.com/safe']);
    const exported = serializeOpportunityResult({ ...result, config } as OpportunityResult);
    expect(exported).not.toContain('config');
    expect(exported).not.toContain('memory-');
  });

  it('cancels while auth is pending and never dispatches a late paid request', async () => {
    const pending = deferred<Awaited<ReturnType<typeof mocks.getSession>>>();
    mocks.getSession.mockReturnValue(pending.promise);
    const controller = new AbortController();
    const promise = run(request, config, controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    pending.resolve({ data: { session: { access_token: 'late-token', user: { id: 'account-a' } } }, error: null });
    await Promise.resolve();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.listeners.size).toBe(0);
  });

  it('aborts the fetch at 180 seconds without waiting for an uncooperative transport', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockReturnValue(new Promise(() => {}));
    const promise = run();
    const assertion = expect(promise).rejects.toMatchObject({ code: 'timeout', message: expect.stringContaining('可能计费') });
    await vi.advanceTimersByTimeAsync(180_000);
    await assertion;
    expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(mocks.listeners.size).toBe(0);
  });

  it('aborts immediately when auth switches to a different account', async () => {
    mocks.fetch.mockReturnValue(new Promise(() => {}));
    const promise = run();
    const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    emitIdentity('account-b');
    await assertion;
    expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });
});

describe('opportunity radar UI', () => {
  it.each(['drift', 'ghibli', 'cotton', 'bamboo', 'street'] as Skin[])('renders a single H1, six accessible checkboxes and optional all-web selection with %s', skin => {
    useTheme.setState({ skin });
    render(<Page />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('checkbox')).toHaveLength(6);
    expect(screen.getAllByRole('checkbox').every(input => !(input as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByLabelText('国家 / 地区')).toHaveAttribute('maxlength', '80');
    expect(screen.getByRole('radio', { name: '快速 · quick' })).toBeChecked();
    expect(screen.getByText('未选择社媒平台：仅全网检索。')).toBeInTheDocument();
  });

  it('guides unauthenticated users back to this page without invoking discovery', () => {
    mocks.auth.user = null;
    render(<Page />);
    expect(screen.getByRole('link', { name: '登录后发现商机' })).toHaveAttribute('href', '/auth?redirect=%2Fopportunities');
    expect(screen.queryByRole('button', { name: '发现商机' })).not.toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('keeps missing keys non-blocking, passes platform/mode selection and shows real evidence/statistics', async () => {
    mocks.settings = Object.fromEntries(Object.keys(config).map(key => [key, '']));
    render(<Page />);
    expect(screen.getByRole('button', { name: '发现商机' })).toBeEnabled();
    expect(screen.getByText('API 配置提示（不影响提交）')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Reddit'));
    fireEvent.click(screen.getByLabelText('深入 · deep'));
    await submit();
    await screen.findByRole('heading', { name: '宠物预约协同' });
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({ platforms: ['reddit'], mode: 'deep' });
    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.getByText('部分平台样本不足')).toBeInTheDocument();
    expect(screen.getByText(/热度不代表付费意愿。国家/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('查看原文证据（实际返回 1 条）'));
    expect(screen.getByText('原文：多个预约工具无法同步。')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /打开原文/ })).toHaveAttribute('href', 'https://example.com/original');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('uses result request rather than edited fields when entering validation and never enables auto-start', async () => {
    render(<Page />);
    await submit();
    await screen.findByRole('heading', { name: '宠物预约协同' });
    fireEvent.change(screen.getByLabelText('国家 / 地区'), { target: { value: 'Japan' } });
    fireEvent.change(screen.getByLabelText('行业'), { target: { value: '汽车' } });
    fireEvent.click(screen.getByRole('button', { name: '进入验证' }));
    const destination = screen.getByTestId('destination').textContent!;
    const params = new URL(destination, 'https://example.com').searchParams;
    expect(params.get('country')).toBe('United States');
    expect(params.get('industry')).toBe('宠物护理');
    expect(params.get('platforms')).toBe('reddit');
    expect(params.get('auto')).toBeNull();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('makes cancellation billing explicit and ignores late results after a new request', async () => {
    const late = deferred<Response>();
    mocks.fetch.mockReturnValueOnce(late.promise);
    render(<Page />);
    await submit();
    const firstSignal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '取消等待' }));
    expect(firstSignal.aborted).toBe(true);
    expect(screen.getByText(/取消不保证停止计费/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '发现商机' }));
    await screen.findByRole('heading', { name: '宠物预约协同' });
    const stale = fixture();
    stale.candidates[0].title = '迟到的旧结果';
    await act(async () => { late.resolve(response(stale)); });
    expect(screen.queryByText('迟到的旧结果')).not.toBeInTheDocument();
  });

  it('hides old results on the raw auth event before context changes, including A-B-A switches', async () => {
    const view = render(<Page />);
    await submit();
    await screen.findByRole('heading', { name: '宠物预约协同' });
    act(() => emitIdentity('account-b'));
    expect(screen.queryByText('宠物预约协同')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '导出 JSON' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('行业')).toHaveValue('');
    expect(screen.getByLabelText(/关键词/)).toHaveValue('');
    mocks.auth.user = { id: 'account-b' };
    view.rerender(<Page />);
    mocks.auth.user = { id: 'account-a' };
    act(() => emitIdentity('account-a'));
    view.rerender(<Page />);
    expect(screen.queryByText('宠物预约协同')).not.toBeInTheDocument();
  });

  it('aborts pending work on account switch and unmount, without showing a late account result', async () => {
    const late = deferred<Response>();
    mocks.fetch.mockReturnValueOnce(late.promise);
    const view = render(<Page />);
    await submit();
    const firstSignal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;
    act(() => emitIdentity('account-b'));
    expect(firstSignal.aborted).toBe(true);
    mocks.auth.user = { id: 'account-b' };
    view.rerender(<Page />);
    await act(async () => { late.resolve(response(fixture())); });
    expect(screen.queryByText('宠物预约协同')).not.toBeInTheDocument();
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'b-token', user: { id: 'account-b' } } }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'account-b' } }, error: null });
    mocks.fetch.mockReturnValueOnce(new Promise(() => {}));
    fireEvent.change(screen.getByLabelText('行业'), { target: { value: '宠物护理' } });
    fireEvent.click(screen.getByRole('button', { name: '发现商机' }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    const secondSignal = mocks.fetch.mock.calls[1][1].signal as AbortSignal;
    view.unmount();
    expect(secondSignal.aborted).toBe(true);
    await act(async () => { await Promise.resolve(); });
    expect(mocks.listeners.size).toBe(0);
  });

  it('shows safe configuration errors, true empty results and blocks non-HTTPS evidence links', async () => {
    mocks.fetch.mockResolvedValueOnce(response({ error: '模型地址未在允许列表中' }, 400));
    render(<Page />);
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('模型地址未在允许列表中');
    const empty = fixture();
    empty.candidates = [];
    mocks.fetch.mockResolvedValueOnce(response(empty));
    fireEvent.click(screen.getByRole('button', { name: '发现商机' }));
    await screen.findByRole('heading', { name: '暂未发现证据充分的商机' });
    expect(screen.queryByRole('button', { name: '进入验证' })).not.toBeInTheDocument();
    const unsafe = fixture();
    unsafe.candidates[0].evidence[0].url = 'http://example.com/plain';
    mocks.fetch.mockResolvedValueOnce(response(unsafe));
    fireEvent.click(screen.getByRole('button', { name: '发现商机' }));
    await screen.findByRole('heading', { name: '宠物预约协同' });
    fireEvent.click(screen.getByText('查看原文证据（实际返回 1 条）'));
    expect(screen.queryByRole('link', { name: /打开原文/ })).not.toBeInTheDocument();
    expect(screen.getByText('未提供有效的 HTTPS 原文链接')).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
