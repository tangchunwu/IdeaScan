import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildChatCompletionBody,
  buildChatCompletionEndpoints,
  requestChatCompletion,
} from "../../supabase/functions/_shared/llm-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("共享 LLM 客户端", () => {
  it("不会把 OpenAI /v1 Base URL 拼成 /v1/v1", () => {
    expect(buildChatCompletionEndpoints("https://api.openai.com/v1")[0]).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
  });

  it("会把官方 OpenAI 根地址规范化到 /v1", () => {
    expect(buildChatCompletionEndpoints("https://api.openai.com")).toEqual([
      "https://api.openai.com/v1/chat/completions",
      "https://api.openai.com/chat/completions",
    ]);
  });

  it("会把重复的 /v1 和完整 endpoint 规范化", () => {
    expect(buildChatCompletionEndpoints("https://api.openai.com/v1/v1/chat/completions")).toEqual([
      "https://api.openai.com/v1/chat/completions",
      "https://api.openai.com/chat/completions",
    ]);
  });

  it("为 gpt-6.1-sol 使用 reasoning_effort，并移除 temperature", () => {
    const body = buildChatCompletionBody({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "test-key",
      model: "gpt-6.1-sol",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.2,
      maxTokens: 5,
    });

    expect(body.reasoning_effort).toBe("low");
    expect(body).not.toHaveProperty("temperature");
    expect(body.max_completion_tokens).toBe(5);
    expect(body).not.toHaveProperty("max_tokens");
  });

  it("保留传统模型的 temperature 参数", () => {
    const body = buildChatCompletionBody({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "test-key",
      model: "gpt-4.1",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.2,
    });

    expect(body.temperature).toBe(0.2);
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body.max_tokens).toBe(800);
  });

  it("404 失败信息不会回显 API Key", async () => {
    const apiKey = "sk-test-secret-key";
    vi.stubGlobal("AbortSignal", { timeout: () => new AbortController().signal });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(`upstream rejected ${apiKey}`, { status: 404 })),
    );

    await expect(
      requestChatCompletion({
        baseUrl: "https://api.openai.com/v1",
        apiKey,
        model: "gpt-6.1-sol",
        messages: [{ role: "user", content: "hi" }],
        timeoutMs: 8000,
      }),
    ).rejects.toThrow("[REDACTED_API_KEY]");
  });
});
