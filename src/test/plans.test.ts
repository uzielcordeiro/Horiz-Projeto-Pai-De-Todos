import { describe, expect, it } from "vitest";
import { parsePlan, plans } from "@/lib/plans";

describe("Planos Stripe enviados", () => {
  it("usa o preço mensal de R$ 27", () => {
    expect(plans.monthly).toEqual({ priceId: "price_1UQyygIAIPw2F9ku9aP2Bu7G", amount: 2700, interval: "month" });
  });
  it("usa o preço anual de R$ 302", () => {
    expect(plans.yearly).toEqual({ priceId: "price_1UQz0gIAIPw2F9kumCop2W12", amount: 30200, interval: "year" });
  });
  it("rejeita planos fora da lista permitida", () => {
    expect(() => parsePlan("custom")).toThrow();
    expect(parsePlan("monthly")).toBe("monthly");
    expect(parsePlan("yearly")).toBe("yearly");
  });
});