import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOpportunityValidationUrl } from "@/lib/validateRoute";
import Validate from "@/pages/Validate";

const state = vi.hoisted(() => ({
  query: "", user: { id: "u-1" } as { id: string } | null,
  navigate: vi.fn(), startValidation: vi.fn(),
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock("react-router-dom", async () => ({
  ...await vi.importActual<typeof import("react-router-dom")>("react-router-dom"),
  useNavigate: () => state.navigate,
  useSearchParams: () => [new URLSearchParams(state.query)],
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: state.user, isLoading: false }) }));
vi.mock("@/hooks/useSettings", () => ({ useSettings: () => ({}) }));
vi.mock("@/hooks/useUserQuota", () => ({ useUserQuota: () => ({ canValidate: true, freeTotal: 3 }) }));
vi.mock("@/hooks/useSkinToast", () => ({ useSkinToast: () => state.toast }));
vi.mock("@/hooks/useDocumentTitle", () => ({ useDocumentTitle: vi.fn() }));
vi.mock("@/hooks/useValidationStream", () => ({ useValidationStream: () => ({
  isValidating: false, hasOwnTikhub: true, cleanup: vi.fn(), startValidation: state.startValidation,
}) }));
vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn() }));
vi.mock("@/lib/invokeFunction", () => ({ invokeFunction: vi.fn() }));
vi.mock("@/components/shared", () => ({
  PageBackground: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  GlassCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Navbar: () => <nav />, LoadingSpinner: () => <span />, SettingsDialog: () => <span />,
}));
vi.mock("@/components/validate/ValidationProgress", () => ({ ValidationProgress: () => <div /> }));

const input = {
  title: "诊所排班助手", problem: "跨时区沟通成本高", targetUsers: "小型诊所",
  country: "美国", industry: "医疗服务", platforms: ["reddit", "youtube"],
};

describe("opportunity validation context", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    state.user = { id: "u-1" };
    state.query = getOpportunityValidationUrl(input).split("?")[1];
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("waits for confirmation and passes country, industry, platforms and tags into analysis", () => {
    render(<Validate />);
    act(() => vi.advanceTimersByTime(1000));
    expect(state.startValidation).not.toHaveBeenCalled();
    const idea = (screen.getByPlaceholderText(/例如：我想开一家猫咪主题咖啡店/) as HTMLTextAreaElement).value;
    for (const value of [input.title, input.problem, input.targetUsers, input.country, input.industry]) {
      expect(idea).toContain(value);
    }
    fireEvent.click(screen.getByRole("button", { name: "验证我的想法" }));
    expect(state.startValidation).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      idea, selectedPlatforms: ["reddit", "youtube"], selectedTags: ["医疗服务"],
    }));
  });

  it("keeps edits to platform selection across rerenders", () => {
    const view = render(<Validate />);
    fireEvent.click(screen.getByRole("button", { name: /YouTube/ }));
    view.rerender(<Validate />);
    fireEvent.click(screen.getByRole("button", { name: "验证我的想法" }));
    expect(state.startValidation).toHaveBeenCalledWith(expect.objectContaining({ selectedPlatforms: ["reddit"] }));
  });

  it("retains the full opportunity query through authentication", () => {
    state.user = null;
    render(<Validate />);
    const target = state.navigate.mock.calls[0][0] as string;
    expect(new URLSearchParams(target.split("?")[1]).get("redirect")).toBe(`/validate?${state.query}`);
    expect(state.startValidation).not.toHaveBeenCalled();
  });

  it("uses the existing default platform for legacy automatic links", () => {
    state.query = "idea=legacy&auto=true&resumeValidationId=v-123";
    render(<Validate />);
    act(() => vi.advanceTimersByTime(500));
    expect(state.startValidation).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      idea: "legacy", selectedPlatforms: ["xiaohongshu"], selectedTags: [], resumeValidationId: "v-123",
    }));
  });

  it("keeps platform and tag context for existing automatic starts", () => {
    state.query += "&auto=true&resumeValidationId=v-456";
    render(<Validate />);
    act(() => vi.advanceTimersByTime(500));
    expect(state.startValidation).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      selectedPlatforms: ["reddit", "youtube"], selectedTags: ["医疗服务"], resumeValidationId: "v-456",
    }));
  });

  it("does not silently switch invalid platforms to the default", () => {
    const params = new URLSearchParams(state.query);
    params.set("platforms", "unknown,,");
    state.query = params.toString();
    render(<Validate />);
    fireEvent.click(screen.getByRole("button", { name: "验证我的想法" }));
    expect(state.startValidation).not.toHaveBeenCalled();
    expect(state.toast.error).toHaveBeenCalledWith("请至少选择一个数据平台");
  });

  it("initializes the next opportunity when the query changes on the same page", () => {
    const view = render(<Validate />);
    state.query = getOpportunityValidationUrl({ ...input, country: "日本", industry: "教育", platforms: ["tiktok"] }).split("?")[1];
    view.rerender(<Validate />);
    fireEvent.click(screen.getByRole("button", { name: "验证我的想法" }));
    expect(state.startValidation).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      idea: expect.stringContaining("目标国家：日本"), selectedPlatforms: ["tiktok"], selectedTags: ["教育"],
    }));
  });
});
