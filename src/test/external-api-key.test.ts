import { describe, expect, it } from "vitest";
import { createExternalApiKey, extractExternalApiKey, hashExternalApiKey, isExternalApiKey } from "../../supabase/functions/_shared/api-key-crypto";

describe("IdeaScan 外部 API Key", () => {
  it("生成可识别且只保存哈希的 Key", async () => {
    const created = await createExternalApiKey();
    expect(isExternalApiKey(created.rawKey)).toBe(true);
    expect(created.rawKey).not.toBe(created.hash);
    expect(await hashExternalApiKey(created.rawKey)).toBe(created.hash);
    expect(created.prefix).toBe(created.rawKey.slice(0, 16));
  });

  it("只从授权头或 X-IdeaScan-Key 读取外部 Key", () => {
    expect(extractExternalApiKey(new Request("https://example.test", { headers: { authorization: "Bearer is_live_test_12345678901234567890" } }))).toBe("is_live_test_12345678901234567890");
    expect(extractExternalApiKey(new Request("https://example.test", { headers: { "x-ideascan-key": "is_live_header_12345678901234567890" } }))).toBe("is_live_header_12345678901234567890");
    expect(extractExternalApiKey(new Request("https://example.test", { headers: { authorization: "Bearer supabase-jwt" } }))).toBe("");
  });
});
