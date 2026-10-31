import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ValidationResponse, SSEProgressEvent } from "@/services/validationService";

const mocks = vi.hoisted(() => ({
  user: { id: "user-a" },
  navigate: vi.fn(), abort: vi.fn(), success: vi.fn(), error: vi.fn(),
  stream: vi.fn(), getValidation: vi.fn(),
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/useSettings", () => ({ useSettings: () => ({ llmFallbacks: [] }) }));
vi.mock("@/hooks/useSkinToast", () => ({ useSkinToast: () => ({ success: mocks.success, error: mocks.error }) }));
vi.mock("@/hooks/useUserQuota", () => ({ useUserQuota: () => ({ hasOwnTikhub: true, refetch: vi.fn() }) }));
vi.mock("@/hooks/useBrowserNotification", () => ({ useBrowserNotification: () => ({ notify: vi.fn() }) }));
vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn() }));
vi.mock("@/services/validationService", () => ({
  createValidationStream: mocks.stream,
  getValidation: mocks.getValidation,
  createValidation: vi.fn(), listValidations: vi.fn(), deleteValidation: vi.fn(),
}));
vi.mock("@/lib/invokeFunction", () => ({ invokeFunction: vi.fn() }));

import { useValidationStream } from "@/hooks/useValidationStream";

let complete: (result: ValidationResponse) => Promise<void>;
let progress: (event: SSEProgressEvent) => void;

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useValidationStream([]), { wrapper });
  act(() => hook.result.current.startValidation({ idea: "test idea", selectedTags: [], selectedPlatforms: ["xiaohongshu", "tiktok"], validationMode: "deep" }));
  return { ...hook, client };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.user = { id: "user-a" };
  mocks.getValidation.mockResolvedValue({ validation: { id: "v1" } });
  mocks.stream.mockImplementation((_request, onProgress, onComplete) => {
    progress = onProgress;
    complete = onComplete;
    return { abort: mocks.abort };
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("validation lifecycle", () => {
  it("shows completion even if report prefetch never responds", async () => {
    mocks.getValidation.mockReturnValue(new Promise(() => {}));
    const hook = setup();
    expect(mocks.stream.mock.calls[0][0].config.overseasPlatforms).toEqual(["tiktok"]);
    expect(mocks.stream.mock.calls[0][0].config.enableXiaohongshu).toBe(true);
    await act(async () => complete({ success: true, validationId: "v1", overallScore: 80 }));
    expect(hook.result.current.completionPreview?.validationId).toBe("v1");
    hook.client.clear();
  });

  it("cancels automatic navigation when the page unmounts", async () => {
    const hook = setup();
    await act(async () => complete({ success: true, validationId: "v1", overallScore: 80 }));
    hook.unmount();
    act(() => vi.advanceTimersByTime(5000));
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.abort).toHaveBeenCalled();
  });

  it("ignores previous account callbacks after an account switch", async () => {
    const hook = setup();
    mocks.user = { id: "user-b" };
    hook.rerender();
    act(() => progress({ event: "progress", progress: 80 }));
    await act(async () => complete({ success: true, validationId: "private-a", overallScore: 80 }));
    act(() => vi.advanceTimersByTime(5000));
    expect(hook.result.current.completionPreview).toBeNull();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
