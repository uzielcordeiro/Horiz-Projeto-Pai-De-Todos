import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginPage } from "@/routes/login";
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/billing.functions", () => ({ createCheckout: vi.fn() }));

const { navigate, signInWithPassword } = vi.hoisted(() => ({
  navigate: vi.fn(),
  signInWithPassword: vi.fn(async () => ({ error: null })),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => config,
  useNavigate: () => navigate,
}));

vi.mock("@/integrations/supabase/extras", () => ({
  supabaseConfigured: true,
  REMEMBER_KEY: "horiz-remember",
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      signInWithPassword: () => signInWithPassword(),
      signUp: async () => ({ data: { session: null }, error: null }),
      resetPasswordForEmail: async () => ({ error: null }),
    },
  },
}));

describe("login remembered e-mail", () => {
  beforeEach(() => localStorage.clear());

  it("prefills the e-mail saved under remembered_email", async () => {
    localStorage.setItem("remembered_email", "uziel@exemplo.com");
    render(<LoginPage />);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "e-mail" })).toHaveValue("uziel@exemplo.com"),
    );
  });

  it("saves the e-mail after a successful login", async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByRole("textbox", { name: "e-mail" }), { target: { value: "novo@exemplo.com" } });
    fireEvent.change(screen.getByLabelText("senha"), { target: { value: "segredo1" } });
    fireEvent.click(screen.getByRole("button", { name: "entrar" }));
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalled());
    expect(localStorage.getItem("remembered_email")).toBe("novo@exemplo.com");
  });

  it("stops remembering the e-mail when 'Lembrar de mim' is unchecked", async () => {
    localStorage.setItem("remembered_email", "velho@exemplo.com");
    render(<LoginPage />);
    const box = await screen.findByRole("checkbox", { name: /Lembrar de mim/i });
    fireEvent.click(box);
    expect(localStorage.getItem("remembered_email")).toBeNull();
  });
});
