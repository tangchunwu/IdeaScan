import { describe, expect, it } from "vitest";
import { getFunctionInvokeError } from "@/lib/adminModelManager";

describe("admin model manager invoke results", () => {
  it("treats an SDK error result as a failed deletion", () => {
    expect(getFunctionInvokeError({ error: { message: "forbidden" } })).toEqual({
      message: "forbidden",
    });
  });

  it("allows removal only when the SDK returns no error", () => {
    expect(getFunctionInvokeError({ data: { success: true }, error: null })).toBeNull();
  });
});
