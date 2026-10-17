import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, getAccount } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getAccount: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession } },
}));

vi.mock("@/lib/billing.functions", () => ({
  getAccount,
}));

import { checkAccess } from "@/lib/access";

const TOKEN = "token-de-teste";
const ACTIVE = { user_id: "u1", email: "raul@example.com", status: "active", full_name: "Uziel", whatsapp: "(69) 90000-0000" };

describe("acesso da página raiz", () => {
  beforeEach(() => {
    getSession.mockReset();
    getAccount.mockReset();
  });

  it("considera deslogado quem não tem sessão salva", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(checkAccess()).resolves.toEqual({ kind: "signed-out" });
    expect(getAccount).not.toHaveBeenCalled();
  });

  it("considera deslogada uma sessão que o serviço de contas recusa", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: TOKEN } } });
    getAccount.mockRejectedValue(new Error("Não autenticado"));
    await expect(checkAccess()).resolves.toEqual({ kind: "signed-out" });
  });

  it("mantém logado com assinatura ativa", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: TOKEN } } });
    getAccount.mockResolvedValue(ACTIVE);
    await expect(checkAccess()).resolves.toEqual({ kind: "active", token: TOKEN, account: ACTIVE });
  });

  it("separa quem entrou sem assinatura ativa", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: TOKEN } } });
    getAccount.mockResolvedValue({ ...ACTIVE, status: null });
    const res = await checkAccess();
    expect(res.kind).toBe("inactive");
  });

  it("não confunde falha do servidor com falta de login", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: TOKEN } } });
    getAccount.mockRejectedValue(new Error("HORIZ_SERVICE_ROLE_KEY ausente"));
    await expect(checkAccess()).rejects.toThrow("HORIZ_SERVICE_ROLE_KEY ausente");
  });
});
