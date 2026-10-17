import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { checkAccess } = vi.hoisted(() => ({ checkAccess: vi.fn() }));

vi.mock("@/lib/access", () => ({
  checkAccess,
  loadAccount: vi.fn(),
  requireActiveSubscription: vi.fn(),
}));

import { routeTree } from "@/routeTree.gen";

const ACTIVE = {
  kind: "active" as const,
  token: "token-de-teste",
  account: { user_id: "u1", email: "raul@example.com", status: "active", full_name: "Uziel", whatsapp: "(69) 90000-0000" },
};

function renderRoot() {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe("página raiz", () => {
  it("mostra o carregamento antes de ter dados e depois abre o painel", async () => {
    checkAccess.mockResolvedValue(ACTIVE);
    renderRoot();

    // Enquanto a sessão é verificada, só o indicador aparece — nada do painel.
    expect(screen.getByText("carregando…")).toBeInTheDocument();

    // Com a sessão ativa, o painel é montado.
    expect(await screen.findByText("Saldos")).toBeInTheDocument();
  });

  it("devolve ao login quem não tem sessão, sem mostrar nada do painel", async () => {
    checkAccess.mockResolvedValue({ kind: "signed-out" });
    const router = renderRoot();

    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(screen.queryByText("Saldos")).not.toBeInTheDocument();
  });
});
