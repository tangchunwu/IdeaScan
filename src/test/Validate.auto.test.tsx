import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
const startValidation = vi.fn();
const skinToast = { info: vi.fn(), error: vi.fn(), success: vi.fn() };
const stream = {
  isValidating: false,
  progress: 0,
  currentStep: 0,
  progressMessage: "",
  isCancelling: false,
  currentValidationId: null,
  stepTimestamps: [],
  completionPreview: null,
  hasOwnTikhub: true,
  cleanup: vi.fn(),
  startValidation,
  handleCancelAndKeep: vi.fn(),
  navigateToReport: vi.fn(),
};

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigate,
    useSearchParams: () => [new URLSearchParams("idea=%E7%8C%AB%E5%92%96%E5%95%A1%E5%BA%97&auto=true&resumeValidationId=v-123")],
  };
});

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u-1" }, isLoading: false }) }));
vi.mock("@/hooks/useSettings", () => ({ useSettings: () => ({}) }));
vi.mock("@/hooks/useUserQuota", () => ({ useUserQuota: () => ({ canValidate: true, freeTotal: 3, hasOwnTikhub: true }) }));
vi.mock("@/hooks/useSkinToast", () => ({ useSkinToast: () => skinToast }));
vi.mock("@/hooks/useDocumentTitle", () => ({ useDocumentTitle: vi.fn() }));
vi.mock("@/hooks/useValidationStream", () => ({ useValidationStream: () => stream }));
vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn() }));
vi.mock("@/lib/invokeFunction", () => ({ invokeFunction: vi.fn() }));
vi.mock("@/components/shared", () => ({
  PageBackground: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  GlassCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Navbar: () => <nav />,
  LoadingSpinner: () => <span />,
  SettingsDialog: () => <button type="button" />,
}));
vi.mock("@/components/validate/ValidationProgress", () => ({ ValidationProgress: () => <div /> }));

describe("Validate automatic URL start", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    stream.isValidating = false;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("starts exactly once after auth is ready even when setting the idea rerenders", async () => {
    const { default: Validate } = await import("@/pages/Validate");

    render(<Validate />);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(startValidation).toHaveBeenCalledTimes(1);
    expect(startValidation).toHaveBeenCalledWith(expect.objectContaining({
      idea: "猫咖啡店",
      resumeValidationId: "v-123",
    }));
  });
});
