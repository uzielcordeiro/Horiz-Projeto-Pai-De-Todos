import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ inputValidator: (validate: (data: unknown) => unknown) => ({
    handler: (handle: (input: { data: unknown }) => unknown) => (input: { data: unknown }) => handle({ data: validate(input.data) }),
  }) }),
}));
import { createCheckout } from "@/lib/billing.functions";

describe("checkout público Stripe", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it.each([
    ["monthly", "price_1UQyygIAIPw2F9ku9aP2Bu7G"],
    ["yearly", "price_1UQz0gIAIPw2F9kumCop2W12"],
  ] as const)("%s envia o preço solicitado sem login", async (plan, price) => {
    vi.stubEnv("STRIPE_SECRET_KEY", "test-only-key");
    const fetchMock = vi.fn(async () => ({ json: async () => ({ url: "https://checkout.stripe.com/test-session" }) }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await createCheckout({ data: { plan, origin: "https://horiz.example" } })).toEqual({ url: "https://checkout.stripe.com/test-session" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    const body = options.body as URLSearchParams;
    expect(body.get("line_items[0][price]")).toBe(price);
    expect(body.get("mode")).toBe("subscription");
    expect(body.has("client_reference_id")).toBe(false);
  });
});