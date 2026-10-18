import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LandingPage } from "@/components/LandingPage";

const { checkout } = vi.hoisted(() => ({ checkout: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => checkout }));
vi.mock("@/lib/billing.functions", () => ({ createCheckout: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => <a href={to} {...props}>{children}</a>,
}));

describe("checkout direto da home", () => {
  beforeEach(() => { checkout.mockReset(); checkout.mockRejectedValue(new Error("offline")); });
  it.each([["Assinar Mensal", "monthly"], ["Assinar Anual", "yearly"]])("%s chama checkout sem exigir sessão", async (label, plan) => {
    render(<LandingPage />);
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(checkout).toHaveBeenCalledWith({ data: { plan, origin: window.location.origin } }));
  });
});