import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const gateMocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: gateMocks.invoke },
  },
}));

import { useAdminGate } from '@/hooks/useAdminGate';

describe('管理后台密码门', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('密码错误时显示服务端给出的原因，并且不写入解锁凭证', async () => {
    gateMocks.invoke.mockResolvedValue({ data: { ok: false, error: "密码错误" }, error: null });
    const { result } = renderHook(() => useAdminGate());

    let outcome: { ok: boolean; error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.verify("wrong-password");
    });

    expect(outcome).toEqual({ ok: false, error: "密码错误" });
    expect(sessionStorage.getItem("admin_gate_token")).toBeNull();
    expect(result.current.isUnlocked).toBe(false);
  });

  it('请求失败时不抛出异常，给出可重试提示', async () => {
    gateMocks.invoke.mockRejectedValue(new Error("Failed to fetch"));
    const { result } = renderHook(() => useAdminGate());

    let outcome: { ok: boolean; error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.verify("any-password");
    });

    expect(outcome).toEqual({ ok: false, error: "网络错误" });
    expect(result.current.isUnlocked).toBe(false);
  });

  it('密码正确时保存解锁凭证', async () => {
    gateMocks.invoke.mockResolvedValue({ data: { ok: true, token: "tok-123" }, error: null });
    const { result } = renderHook(() => useAdminGate());

    await act(async () => {
      const outcome = await result.current.verify("right-password");
      expect(outcome).toEqual({ ok: true });
    });

    expect(sessionStorage.getItem("admin_gate_token")).toBe("tok-123");
    await waitFor(() => expect(result.current.isUnlocked).toBe(true));
  });
});
