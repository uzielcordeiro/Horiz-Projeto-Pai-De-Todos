import { describe, expect, it } from "vitest";
import { checkoutUrlFrom } from "@/routes/planos";

describe("URL de pagamento vinda do checkout", () => {
  it.each<[string, unknown, string]>([
    ["url", { url: "https://checkout.stripe.com/a" }, "https://checkout.stripe.com/a"],
    ["checkoutUrl", { checkoutUrl: "https://checkout.stripe.com/b" }, "https://checkout.stripe.com/b"],
    ["data.url", { data: { url: "https://checkout.stripe.com/c" } }, "https://checkout.stripe.com/c"],
    ["data.checkoutUrl", { data: { checkoutUrl: "https://checkout.stripe.com/d" } }, "https://checkout.stripe.com/d"],
  ])("usa %s quando é o único formato retornado", (_shape, response, expected) => {
    expect(checkoutUrlFrom(response)).toBe(expected);
  });

  it("falha com mensagem clara quando nenhuma URL chega", () => {
    expect(() => checkoutUrlFrom({})).toThrow("URL de pagamento não retornada pelo servidor.");
    expect(() => checkoutUrlFrom(null)).toThrow("URL de pagamento não retornada pelo servidor.");
    expect(() => checkoutUrlFrom({ data: { checkoutUrl: "  " } })).toThrow("URL de pagamento não retornada pelo servidor.");
  });
});
