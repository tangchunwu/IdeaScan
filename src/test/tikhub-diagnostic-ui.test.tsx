import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TikHubDiagnosticPanel } from '../components/shared/TikHubDiagnosticPanel';
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/lib/invokeFunction', () => ({ invokeFunction: (...args: unknown[]) => mocks.invoke(...args) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('TikHub diagnostic UI', () => {
  it('allows a single platform and preserves safe plain-object error fields', async () => {
    mocks.invoke.mockResolvedValue({ error: { message: 'permission denied', code: '403', kind: 'http', httpStatus: 403 }, data: null });
    render(<TikHubDiagnosticPanel token="offline-token" />);
    fireEvent.click(screen.getByRole('button', { name: '诊断 Instagram' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('403'));
    expect(screen.getByRole('status')).toHaveTextContent('http');
    expect(mocks.invoke.mock.calls[0][1].body.platforms).toEqual(['instagram']);
  });
  it('clears previous results on token change and ignores stale replies', async () => {
    let resolve!: (value: unknown) => void;
    mocks.invoke.mockImplementation(() => new Promise(r => { resolve = r; }));
    const view = render(<TikHubDiagnosticPanel token="old-offline" />);
    fireEvent.click(screen.getByRole('button', { name: '诊断 TikTok' }));
    view.rerender(<TikHubDiagnosticPanel token="new-offline" />);
    resolve({ data: { message: 'stale-result', platforms: [], apiCalls: 3 }, error: null });
    await waitFor(() => expect(screen.queryByText(/stale-result/)).not.toBeInTheDocument());
  });
  it('does not crash on the old flat response and asks for the new function deployment', async () => {
    mocks.invoke.mockResolvedValue({ data: { valid: true, message: 'old response', platforms: [{ platform: 'tiktok', valid: true }] }, error: null });
    render(<TikHubDiagnosticPanel token="offline-token" />);
    fireEvent.click(screen.getByRole('button', { name: '诊断 TikTok' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('请先部署最新版 verify-config'));
    expect(screen.getByRole('status')).not.toHaveTextContent('Cannot read properties');
  });
  it('renders a plain invoke error status without exposing its raw body', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { status: 502, message: 'upstream raw secret body' } });
    render(<TikHubDiagnosticPanel token="offline-token" />);
    fireEvent.click(screen.getByRole('button', { name: '诊断 TikTok' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('HTTP 502'));
    expect(screen.getByRole('status')).toHaveTextContent('type http');
    expect(screen.getByRole('status')).not.toHaveTextContent('upstream raw secret body');
  });
});
