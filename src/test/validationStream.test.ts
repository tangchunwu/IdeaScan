import { afterEach, describe, expect, it, vi } from "vitest";
import { createValidationStream } from "@/services/validationService";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function startStream(chunks: Uint8Array[]) {
  vi.stubEnv("VITE_DISABLE_APP_AUTH", "true");
  const read = vi.fn();
  for (const value of chunks) read.mockResolvedValueOnce({ done: false, value });
  read.mockResolvedValue({ done: true });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    body: { getReader: () => ({ read, cancel: vi.fn(), releaseLock: vi.fn() }) },
  }));
  const progress = vi.fn();
  const complete = vi.fn();
  const error = vi.fn();
  createValidationStream({ idea: "test", tags: [] }, progress, complete, error);
  return { progress, complete, error, read };
}

describe("validation stream transport", () => {
  it("delivers a complete event split into separate network chunks", async () => {
    const event = new TextEncoder().encode('data: {"event":"complete","result":{"validationId":"v1","overallScore":80}}\n\n');
    const { complete, error, read } = startStream([event.slice(0, 35), event.slice(35)]);
    await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(complete).toHaveBeenCalledWith({ success: true, validationId: "v1", overallScore: 80 });
    expect(error).not.toHaveBeenCalled();
  });

  it("reports premature EOF instead of leaving the UI in progress", async () => {
    const { complete, error, read } = startStream([new TextEncoder().encode('data: {"event":"progress","progress":50}\n\n')]);
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));
    expect(complete).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
  });
});
