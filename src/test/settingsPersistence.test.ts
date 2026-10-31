import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      getUser: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    functions: { invoke: vi.fn() },
  },
}));

import { useSettings } from "@/hooks/useSettings";

const storageKey = "user-settings";

const readStoredState = () => {
  const raw = localStorage.getItem(storageKey);
  return raw ? JSON.parse(raw) as { state?: Record<string, unknown>; version?: number } : null;
};

describe("settings secret persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    useSettings.setState({
      llmApiKey: "",
      tikhubToken: "",
      bochaApiKey: "",
      youApiKey: "",
      tavilyApiKey: "",
      imageGenApiKey: "",
      llmFallbacks: [],
      isSynced: false,
      lastSyncError: null,
    });
  });

  it("migrates legacy secrets into memory and rewrites storage without them", async () => {
    localStorage.setItem(storageKey, JSON.stringify({
      version: 0,
      state: {
        llmProvider: "custom",
        llmBaseUrl: "https://llm.example.com/v1",
        llmApiKey: "legacy-llm-secret",
        tikhubToken: "legacy-tikhub-secret",
        bochaApiKey: "legacy-bocha-secret",
        youApiKey: "legacy-you-secret",
        tavilyApiKey: "legacy-tavily-secret",
        imageGenApiKey: "legacy-image-secret",
        llmFallbacks: [{
          baseUrl: "https://fallback.example.com/v1",
          apiKey: "legacy-fallback-secret",
          model: "fallback-model",
        }],
      },
    }));

    await useSettings.persist.rehydrate();

    const state = useSettings.getState();
    expect(state.llmApiKey).toBe("legacy-llm-secret");
    expect(state.tikhubToken).toBe("legacy-tikhub-secret");
    expect(state.llmFallbacks[0]?.apiKey).toBe("legacy-fallback-secret");

    const stored = readStoredState();
    expect(stored?.state).not.toHaveProperty("llmApiKey");
    expect(stored?.state).not.toHaveProperty("tikhubToken");
    expect(stored?.state).not.toHaveProperty("bochaApiKey");
    expect(stored?.state).not.toHaveProperty("youApiKey");
    expect(stored?.state).not.toHaveProperty("tavilyApiKey");
    expect(stored?.state).not.toHaveProperty("imageGenApiKey");
    expect(JSON.stringify(stored)).not.toContain("legacy-fallback-secret");
    expect((stored?.state?.llmFallbacks as Array<Record<string, unknown>>)[0]).not.toHaveProperty("apiKey");
    expect(stored?.state?.llmProvider).toBe("custom");
  });

  it("persists preferences while keeping newly entered secrets out of localStorage", () => {
    useSettings.getState().updateSettings({
      llmProvider: "deepseek",
      llmApiKey: "new-llm-secret",
      tikhubToken: "new-tikhub-secret",
      llmFallbacks: [{
        baseUrl: "https://fallback.example.com/v1",
        apiKey: "new-fallback-secret",
        model: "fallback-model",
      }],
    });

    const stored = readStoredState();
    expect(stored?.state?.llmProvider).toBe("deepseek");
    expect(JSON.stringify(stored)).not.toContain("new-llm-secret");
    expect(JSON.stringify(stored)).not.toContain("new-tikhub-secret");
    expect(JSON.stringify(stored)).not.toContain("new-fallback-secret");
  });

  it("clears all in-memory secrets when the session is explicitly cleared", () => {
    useSettings.getState().updateSettings({
      llmApiKey: "session-llm-secret",
      tikhubToken: "session-tikhub-secret",
      llmFallbacks: [{ baseUrl: "https://fallback.example.com/v1", apiKey: "session-fallback-secret", model: "fallback" }],
    });

    useSettings.getState().clearSensitiveSettings();

    const state = useSettings.getState();
    expect(state.llmApiKey).toBe("");
    expect(state.tikhubToken).toBe("");
    expect(state.llmFallbacks[0]?.apiKey).toBe("");
    expect(JSON.stringify(readStoredState())).not.toContain("session-llm-secret");
    expect(JSON.stringify(readStoredState())).not.toContain("session-fallback-secret");
  });
});
