/**
 * FISCAL DA ABA CONTA (editar perfil)
 *
 * Abre a aba Conta (ProfileBoard) de verdade, troca o roteador, o login e o servidor por
 * versões de mentira e finge que o servidor recusou o salvamento do nome. Confere:
 *  1. recusa: o aviso "Erro ao salvar. Tente de novo." aparece, a janela continua aberta
 *     com o nome digitado e o nome no topo da tela NÃO muda;
 *  2. aceita (controle): a janela fecha e o nome no topo muda de verdade;
 *  3. clique duplo: uma só chamada ao servidor e o botão "salvando...";
 *  4. só o nome é enviado (sem whatsapp);
 *  5. depois de uma falha, fechar e reabrir a janela não mostra o erro antigo.
 *
 * Se este arquivo ficar vermelho depois de uma mudança, a mudança tirou uma proteção.
 * Se for só um texto de botão que mudou, ajuste o texto aqui.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const AVISO = "Erro ao salvar. Tente de novo.";

const h = vi.hoisted(() => ({
  modo: "recusa" as "recusa" | "aceita" | "espera",
  chamadas: [] as any[],
  liberar: null as null | ((v: unknown) => void),
  recusar: null as null | ((e: unknown) => void),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            access_token: "tok",
            user: { id: "u1", email: "uziel@exemplo.com", user_metadata: { full_name: "Uziel" } },
          },
        },
      }),
      signOut: vi.fn(async () => ({ error: null })),
    },
  },
}));

vi.mock("@/lib/billing.functions", () => ({
  getAccount: async () => ({ full_name: "Uziel", email: "uziel@exemplo.com", whatsapp: "6999999999" }),
  saveProfile: (arg: any) => {
    h.chamadas.push(arg);
    if (h.modo === "recusa") return Promise.reject(new Error("o servidor recusou (fiscal)"));
    if (h.modo === "espera") {
      return new Promise((resolve, reject) => {
        h.liberar = resolve;
        h.recusar = reject;
      });
    }
    return Promise.resolve({ ok: true });
  },
}));

import { ProfileBoard } from "@/components/ProfileBoard";

// ---------- ajudantes de tela ----------

const nomeNoTopo = () =>
  document.querySelector('section[aria-label="Dados do perfil"] h2')?.textContent ?? "SEM NOME";
const temDialogo = () => document.querySelector('[role="dialog"]') !== null;
const dialogo = () => document.querySelector('[role="dialog"]') as HTMLElement;
const campoNome = () => within(dialogo()).getByLabelText("nome") as HTMLInputElement;

function semear(modo: "recusa" | "aceita" | "espera") {
  h.modo = modo;
  h.chamadas.length = 0;
  h.liberar = null;
  h.recusar = null;
}

async function abrirEdicao() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProfileBoard />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(nomeNoTopo()).toBe("Uziel"));
  fireEvent.click(screen.getByRole("button", { name: "editar perfil" }));
  await screen.findByRole("dialog");
}

const digitarNome = (valor: string) => fireEvent.change(campoNome(), { target: { value: valor } });
const salvar = () => fireEvent.click(within(dialogo()).getByRole("button", { name: "salvar" }));

beforeEach(() => {
  semear("recusa");
});
afterEach(() => {
  cleanup();
});

describe("fiscal da Conta: servidor recusa", () => {
  it("mostra o aviso, mantém a janela com o nome digitado e não muda o nome do topo", async () => {
    semear("recusa");
    await abrirEdicao();
    digitarNome("Novo Nome");

    salvar();

    expect(await screen.findByText(AVISO)).toBeInTheDocument();
    expect(h.chamadas).toHaveLength(1);
    expect(temDialogo()).toBe(true);
    expect(campoNome().value).toBe("Novo Nome");
    expect(nomeNoTopo()).toBe("Uziel");
    await waitFor(() => expect(within(dialogo()).getByRole("button", { name: "salvar" })).toBeEnabled());
  }, 20000);

  it("depois da falha, fechar e reabrir a janela não mostra o erro antigo", async () => {
    semear("recusa");
    await abrirEdicao();
    digitarNome("Novo Nome");
    salvar();
    expect(await screen.findByText(AVISO)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(temDialogo()).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "editar perfil" }));
    await screen.findByRole("dialog");

    expect(screen.queryByText(AVISO)).toBeNull();
    expect(campoNome().value).toBe("Uziel");
  }, 20000);
});

describe("fiscal da Conta: servidor aceita (controle)", () => {
  it("fecha a janela, muda o nome do topo e envia só o nome", async () => {
    semear("aceita");
    await abrirEdicao();
    digitarNome("  Novo Nome  ");

    salvar();

    await waitFor(() => expect(temDialogo()).toBe(false));
    expect(nomeNoTopo()).toBe("Novo Nome");
    expect(screen.queryByText(AVISO)).toBeNull();
    expect(h.chamadas).toHaveLength(1);
    expect(h.chamadas[0].data).toEqual({ token: "tok", full_name: "Novo Nome" });
  }, 20000);
});

describe("fiscal da Conta: clique duplo", () => {
  it("clicar duas vezes faz uma chamada só e o botão mostra salvando...", async () => {
    semear("espera");
    await abrirEdicao();
    digitarNome("Novo Nome");
    const botao = within(dialogo()).getByRole("button", { name: "salvar" });

    fireEvent.click(botao);
    fireEvent.click(botao);

    await waitFor(() => expect(h.chamadas).toHaveLength(1));
    expect(await within(dialogo()).findByRole("button", { name: "salvando..." })).toBeDisabled();
    h.liberar!({ ok: true });
    await waitFor(() => expect(temDialogo()).toBe(false));
    expect(nomeNoTopo()).toBe("Novo Nome");
    expect(h.chamadas).toHaveLength(1);
  }, 20000);

  it("enviar o formulário duas vezes (Enter) faz uma chamada só", async () => {
    semear("espera");
    await abrirEdicao();
    digitarNome("Novo Nome");
    const formulario = within(dialogo()).getByRole("button", { name: "salvar" }).closest("form")!;

    fireEvent.submit(formulario);
    fireEvent.submit(formulario);

    await waitFor(() => expect(h.chamadas).toHaveLength(1));
    h.liberar!({ ok: true });
    await waitFor(() => expect(temDialogo()).toBe(false));
    expect(h.chamadas).toHaveLength(1);
  }, 20000);

  it("se a chamada duplicada falha, o botão volta a funcionar e o aviso aparece", async () => {
    semear("espera");
    await abrirEdicao();
    digitarNome("Novo Nome");

    salvar();
    await waitFor(() => expect(h.chamadas).toHaveLength(1));
    h.recusar!(new Error("falhou (fiscal)"));

    expect(await screen.findByText(AVISO)).toBeInTheDocument();
    expect(temDialogo()).toBe(true);
    expect(nomeNoTopo()).toBe("Uziel");
    await waitFor(() => expect(within(dialogo()).getByRole("button", { name: "salvar" })).toBeEnabled());
  }, 20000);
});
