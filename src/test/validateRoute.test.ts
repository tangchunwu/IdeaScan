import { describe, expect, it } from "vitest";
import {
  createValidateAuthRedirect,
  getValidateRouteIntent,
  getDiscoverValidationUrl,
} from "@/lib/validateRoute";

describe("validate route helpers", () => {
  it("uses URLSearchParams output as-is without decoding it twice", () => {
    const params = new URLSearchParams("idea=%E7%8C%AB%E5%92%96%E5%95%A1%E5%BA%97&auto=true");

    expect(getValidateRouteIntent(params)).toEqual({
      idea: "猫咖啡店",
      auto: true,
      resumeValidationId: "",
    });
  });

  it("keeps the full validation query when redirecting to login", () => {
    const params = new URLSearchParams(
      "idea=%E7%8C%AB%E5%92%96%E5%95%A1%E5%BA%97&auto=true&resumeValidationId=v-123",
    );

    const redirect = new URLSearchParams(createValidateAuthRedirect(params).split("?")[1]).get("redirect");
    expect(redirect).toBe("/validate?idea=%E7%8C%AB%E5%92%96%E5%95%A1%E5%BA%97&auto=true&resumeValidationId=v-123");
  });

  it("uses the same idea parameter for Discover bubble navigation", () => {
    expect(getDiscoverValidationUrl("猫咪下午茶 & 咖啡")).toBe(
      "/validate?idea=%E7%8C%AB%E5%92%AA%E4%B8%8B%E5%8D%88%E8%8C%B6%20%26%20%E5%92%96%E5%95%A1",
    );
  });
});
