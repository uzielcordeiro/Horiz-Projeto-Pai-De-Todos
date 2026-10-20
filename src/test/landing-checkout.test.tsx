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

  it("não deixa o clique em um plano vazar para os pais do card", () => {
    const onParentClick = vi.fn();
    render(<div onClick={onParentClick}><LandingPage /></div>);
    fireEvent.click(screen.getByRole("button", { name: "Assinar Mensal" }));
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("o plano em aberto não desativa o botão do outro plano", async () => {
    checkout.mockImplementation(() => new Promise(() => {}));
    render(<LandingPage />);
    const mensal = screen.getByRole<HTMLButtonElement>("button", { name: "Assinar Mensal" });
    const anual = screen.getByRole<HTMLButtonElement>("button", { name: "Assinar Anual" });
    fireEvent.click(mensal);
    await waitFor(() => expect(checkout).toHaveBeenCalledTimes(1));
    expect(mensal.disabled).toBe(true);
    expect(anual.disabled).toBe(false);
  });

  it("o plano em aberto não bloqueia o checkout do outro plano", async () => {
    checkout.mockImplementation(() => new Promise(() => {}));
    render(<LandingPage />);
    const mensal = screen.getByRole<HTMLButtonElement>("button", { name: "Assinar Mensal" });
    const anual = screen.getByRole<HTMLButtonElement>("button", { name: "Assinar Anual" });
    fireEvent.click(mensal);
    fireEvent.click(anual);
    await waitFor(() => expect(checkout).toHaveBeenCalledTimes(2));
    expect(checkout).toHaveBeenLastCalledWith({ data: { plan: "yearly", origin: window.location.origin } });
  });
});
