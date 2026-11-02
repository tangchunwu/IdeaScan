import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { getOpportunityValidationUrl, getValidateRouteIntent } from "@/lib/validateRoute";
import { useValidationStream } from "@/hooks/useValidationStream";
import type { ValidationRequest } from "@/services/validationService";

const mocks = vi.hoisted(() => ({ stream: vi.fn((_request: ValidationRequest) => ({ abort: vi.fn() })) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-a" } }) }));
vi.mock("@/hooks/useSettings", () => ({ useSettings: () => ({ llmFallbacks: [] }) }));
vi.mock("@/hooks/useSkinToast", () => ({ useSkinToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/hooks/useUserQuota", () => ({ useUserQuota: () => ({ hasOwnTikhub: true, refetch: vi.fn() }) }));
vi.mock("@/hooks/useBrowserNotification", () => ({ useBrowserNotification: () => ({ notify: vi.fn() }) }));
vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn() }));
vi.mock("@/services/validationService", () => ({
  createValidationStream: mocks.stream, getValidation: vi.fn(),
  createValidation: vi.fn(), listValidations: vi.fn(), deleteValidation: vi.fn(),
}));
vi.mock("@/lib/invokeFunction", () => ({ invokeFunction: vi.fn() }));

afterEach(cleanup);

it("carries opportunity country and industry into the backend analysis request", () => {
  const url = getOpportunityValidationUrl({
    title: "诊所排班助手", problem: "跨时区沟通成本高", targetUsers: "小型诊所",
    country: "美国", industry: "医疗服务", platforms: ["reddit", "youtube"],
  });
  const intent = getValidateRouteIntent(new URLSearchParams(url.split("?")[1]));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useValidationStream([]), { wrapper });
  act(() => hook.result.current.startValidation({
    idea: intent.idea, selectedTags: intent.tags, selectedPlatforms: intent.platforms, validationMode: "deep",
  }));
  expect(mocks.stream).toHaveBeenCalledTimes(1);
  expect(mocks.stream.mock.calls[0][0]).toMatchObject({
    idea: expect.stringContaining("目标国家：美国"),
    tags: ["医疗服务"],
    config: { enableXiaohongshu: false, enableDouyin: false, overseasPlatforms: ["reddit", "youtube"] },
  });
  expect(mocks.stream.mock.calls[0][0].idea).toContain("目标行业：医疗服务");
  hook.unmount();
  client.clear();
});
