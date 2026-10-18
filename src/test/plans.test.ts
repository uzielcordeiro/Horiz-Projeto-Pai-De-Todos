import { describe, expect, it } from "vitest";
import { parsePlan, PLANS } from "@/lib/plans";

describe("planos fornecidos", () => {
  it("usa o preço mensal fornecido", () => {
    expect(PLANS.monthly).toEqual({ amount: 27, priceId: "price_1UQyygIAIPw2F9ku9aP2Bu7G" });
  });
  it("usa o preço anual fornecido", () => {
    expect(PLANS.yearly).toEqual({ amount: 302, priceId: "price_1UQz0gIAIPw2F9kumCop2W12" });
  });
  it("preserva apenas as duas opções válidas de checkout", () => {
    expect(parsePlan("monthly")).toBe("monthly");
    expect(parsePlan("yearly")).toBe("yearly");
    expect(parsePlan("https://example.com")).toBeUndefined();
    expect(parsePlan("price_fake")).toBeUndefined();
  });
});