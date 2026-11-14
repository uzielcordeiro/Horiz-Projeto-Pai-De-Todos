/**
 * FISCAL DA SAÍDA NAS TELAS DE BLOQUEIO
 *
 * Abre a tela principal (/app) de verdade, troca o roteador e o Supabase por versões de mentira
 * e finge que a conta não pode entrar. Em cada tela de bloqueio, aperta "Sair da conta" e confere:
 *  1. existe um botão "Sair da conta" só (sem botão duplicado);
 *  2. a sessão é encerrada uma vez;
 *  3. aparece "Saindo...";
 *  4. a pessoa é levada para o login, sem deixar o Voltar reabrir o app.
 *
 * Telas cobertas: "Você ainda não é assinante" (conta inativa ou sem assinatura)
 * e "Acesso Suspenso" (pagamento atrasado ou assinatura cancelada).
 *
 * Se este arquivo ficar vermelho depois de uma mudança, a mudança tirou a saída certa dessas telas.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  status: "inactive" as string | null,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => h.navigate,
}));

// Só o roteador e o Supabase são de mentira. O botão, o "Saindo..." e o useSignOut são os de verdade.
vi.mock("@/integrations/supabase/client", () => {
  const tabela = (nome: string) => {
    const c: any = {
      select: () => c,
      eq: () => c,
      order: () => c,
      range: () => c,
      maybeSingle: async () => ({
        data: nome === "subscriptions" ? (h.status ? { status: h.status } : null) : null,
        error: null,
      }),
      then: (ok: any, err: any) => Promise.resolve({ data: [], error: null }).then(ok, err),
    };
    return c;
  };
  return {
    supabase: {
      from: (nome: string) => tabela(nome),
      rpc: async () => ({ data: null, error: null }),
      auth: {
        getSession: async () => ({
          data: { session: { user: { id: "u1", created_at: "2026-01-01T00:00:00Z" } } },
        }),
        signOut: () => h.signOut(),
      },
    },
  };
});

import { Route } from "@/routes/app";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe.each([
  ["inactive", "Você ainda não é assinante"],
  [null, "Você ainda não é assinante"],
  ["past_due", "Acesso Suspenso"],
  ["canceled", "Acesso Suspenso"],
])("tela de bloqueio com status %s", (status, titulo) => {
  it("Sair da conta encerra a sessão, mostra Saindo... e vai para o login", async () => {
    h.status = status as string | null;
    const App = (Route as any).options.component;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>,
    );

    await screen.findByText(titulo);
    expect(screen.getAllByRole("button", { name: "Sair da conta" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Sair da conta" }));

    await waitFor(() => expect(h.signOut).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveTextContent("Saindo...");
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: "/login", replace: true }), {
      timeout: 3000,
    });
  });
});
