import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProfileBoard } from "@/components/ProfileBoard";

const { signOut, navigate } = vi.hoisted(() => ({
  signOut: vi.fn(async () => ({ error: null })),
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      signOut: () => signOut(),
    },
  },
}));

vi.mock("@/lib/billing.functions", () => ({
  getAccount: async () => ({ full_name: "Uziel", email: "uziel@exemplo.com", whatsapp: "6999999999" }),
  saveProfile: async () => ({}),
}));

function renderProfile() {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <ProfileBoard />
    </QueryClientProvider>,
  );
  return queryClient;
}

describe("profile sign out", () => {
  it("ends the session, drops cached data and forces the login screen", async () => {
    const queryClient = renderProfile();
    queryClient.setQueryData(["perfil-data"], { entries: [] });

    fireEvent.click(screen.getByRole("button", { name: "sair" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "sair" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Saindo...");
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/login", replace: true }), { timeout: 3000 });
    expect(queryClient.getQueryData(["perfil-data"])).toBeUndefined();
  });
});
