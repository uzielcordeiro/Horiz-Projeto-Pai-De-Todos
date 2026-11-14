/**
 * FISCAL DO DESFAZER DO RESET
 *
 * Abre a tela principal (/app) de verdade, com o roteador, o login e o Supabase de mentira.
 * No menu lateral "Resetar tudo" há dois botões ("Resetar este mês?" e "Resetar tudo?") e, depois
 * de resetar, o botão "Desfazer". Este arquivo confere que o Desfazer devolve os dados ao BANCO
 * (e não só à tela), pelo mesmo caminho dos outros salvamentos (a função salvar_calendario).
 *
 * Provas:
 *  1. reset aceito + Desfazer: o banco recebe de volta os lançamentos, as séries, o orçamento e os
 *     valores editados do Dia/Dia, e a tela volta ao que era;
 *  2. reset aceito + Desfazer recusado: aparece o aviso "Erro ao salvar. Tente de novo." e a tela
 *     NÃO finge que voltou;
 *  3. reset recusado: o aviso aparece, a tela já fica como era e o Desfazer não manda nada ao banco;
 *  4. Desfazer apertado enquanto o reset ainda espera a resposta do banco: ele espera e só então grava.
 *
 * Você (leigo) não precisa abrir nem mexer neste arquivo: ele roda sozinho no GitHub Actions.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const AVISO = "Erro ao salvar. Tente de novo.";
const HOJE = "2026-11-12";
// Saídas do dia com os dados de mentira: mercado 50 + aluguel 80.
const COM_DADOS = "130,00";

const h = vi.hoisted(() => ({
  modo: "aceita" as "recusa" | "aceita" | "espera",
  chamadas: [] as { nome: string; args: any }[],
  gravacoesDesconhecidas: [] as string[],
  liberar: null as null | ((v: unknown) => void),
  tabelas: {} as Record<string, any[]>,
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => h.navigate,
}));

// Só o roteador, o login e o Supabase são de mentira. O sonner (aviso) é o de verdade.
vi.mock("@/integrations/supabase/client", () => {
  const recusada = () => {
    const r: any = {
      select: () => r,
      eq: () => r,
      match: () => r,
      in: () => r,
      then: (ok: any, err: any) =>
        Promise.resolve({ data: null, error: { message: "gravação desconhecida (fiscal)" } }).then(ok, err),
    };
    return r;
  };
  const tabela = (nome: string) => {
    const c: any = {
      select: () => c,
      eq: () => c,
      order: () => c,
      range: () => c,
      maybeSingle: async () => ({ data: (h.tabelas[nome] ?? [])[0] ?? null, error: null }),
      then: (ok: any, err: any) => Promise.resolve({ data: h.tabelas[nome] ?? [], error: null }).then(ok, err),
    };
    for (const metodo of ["insert", "upsert", "update", "delete"]) {
      c[metodo] = () => {
        h.gravacoesDesconhecidas.push(`${nome}.${metodo}`);
        return recusada();
      };
    }
    return c;
  };
  return {
    supabase: {
      from: (nome: string) => tabela(nome),
      rpc: (nome: string, args: unknown) => {
        h.chamadas.push({ nome, args });
        if (nome !== "salvar_calendario") {
          h.gravacoesDesconhecidas.push(`rpc ${nome}`);
          return Promise.resolve({ data: null, error: { message: "função desconhecida (fiscal)" } });
        }
        if (h.modo === "espera") {
          return new Promise((resolve) => {
            h.liberar = resolve;
          });
        }
        return Promise.resolve({
          data: null,
          error: h.modo === "recusa" ? { message: "o banco recusou (fiscal)" } : null,
        });
      },
      auth: {
        getSession: async () => ({
          data: { session: { user: { id: "u1", created_at: "2026-01-01T00:00:00Z" } } },
        }),
        signOut: vi.fn(),
      },
    },
  };
});

import { Route } from "@/routes/app";

// ---------- dados de mentira ----------

const DADOS = {
  subscriptions: [{ status: "active" }],
  transactions: [
    {
      id: "t1",
      user_id: "u1",
      date: HOJE,
      amount: 50,
      type: "saidas",
      description: "Mercado teste",
      marketing_tags: [],
    },
  ],
  recurrences: [
    {
      payload: {
        id: "r1",
        kind: "saidas",
        name: "Aluguel teste",
        label: "Aluguel teste",
        tags: [],
        amount: 80,
        freq: "monthly",
        daysOfMonth: [12],
        daysOfWeek: [],
        startDate: "2026-10-12",
        installments: 6,
        endDate: null,
        skipped: [],
      },
    },
  ],
  forecasts: [{ payload: { id: "f1", name: "mercado", amount: 300, period: "mensal", tags: [] } }],
  forecast_day_edits: [{ edits: { [HOJE]: 20 } }],
};

function semear(modo: "recusa" | "aceita" | "espera") {
  h.modo = modo;
  h.chamadas.length = 0;
  h.gravacoesDesconhecidas.length = 0;
  h.liberar = null;
  h.tabelas = JSON.parse(JSON.stringify(DADOS));
}

// ---------- ajudantes de tela ----------

const limpa = (t: string) => t.trim().replace(/^[^\p{L}\p{N}]+/u, "");
const nomeDe = (el: Element) => limpa(el.getAttribute("aria-label") ?? el.textContent ?? "");
const SELETOR = { button: "button", menuitem: '[role="menuitem"]' } as const;
const achar = (papel: keyof typeof SELETOR, nome: string) =>
  Array.from(document.body.querySelectorAll(SELETOR[papel])).find((el) => nomeDe(el) === nome) as HTMLElement | undefined;
const esperarPor = (papel: keyof typeof SELETOR, nome: string) =>
  waitFor(() => {
    const el = achar(papel, nome);
    if (!el) throw new Error(`não achei ${papel} "${nome}"`);
    return el;
  });

const linhaDoDia = () => document.querySelector(`[data-day-row="${HOJE}"]`) as HTMLElement;
const fotoDaLinha = () => linhaDoDia()?.textContent ?? "SEM LINHA";

async function abrirApp() {
  const App = (Route as any).options.component;
  render(<App />);
  await esperarPor("button", "Novo");
  // espera os dados chegarem: a linha de hoje mostra as saídas somadas
  await waitFor(() => expect(fotoDaLinha()).toContain(COM_DADOS));
}

async function resetar(qual: "Resetar este mês?" | "Resetar tudo?") {
  fireEvent.click(achar("button", "Resetar tudo")!);
  fireEvent.click(await esperarPor("menuitem", qual));
}

const desfazer = async () => fireEvent.click(await esperarPor("menuitem", "Desfazer"));

const ids = (lista: any[] | undefined) => (lista ?? []).map((x) => x.id);

// ---------- preparo geral ----------

beforeEach(() => {
  // Só a data é congelada (os relógios seguem reais, para o waitFor funcionar).
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 12, 12));
  localStorage.clear();
  // O jsdom não tem estas duas funções de rolagem.
  Element.prototype.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  toast.dismiss();
  cleanup();
  vi.useRealTimers();
  // O banco de mentira só conhece a função salvar_calendario.
  expect(h.gravacoesDesconhecidas, "o app gravou por um caminho que o fiscal não conhece").toEqual([]);
});

// ---------- as provas ----------

describe("Desfazer do reset: banco aceita o reset e o Desfazer", () => {
  it("Resetar tudo? e Desfazer: o banco recebe tudo de volta", async () => {
    semear("aceita");
    await abrirApp();
    const antes = fotoDaLinha();

    await resetar("Resetar tudo?");
    await waitFor(() => expect(h.chamadas).toHaveLength(1));
    await waitFor(() => expect(fotoDaLinha()).not.toContain(COM_DADOS));

    await desfazer();

    await waitFor(() => expect(h.chamadas).toHaveLength(2));
    const p = h.chamadas[1]!.args.p;
    expect(h.chamadas[1]!.nome).toBe("salvar_calendario");
    expect(ids(p.tx_upsert)).toEqual(["t1"]);
    expect(ids(p.rec_upsert)).toEqual(["r1"]);
    expect(ids(p.fc_upsert)).toEqual(["f1"]);
    expect(p.day_edits).toEqual({ [HOJE]: 20 });
    await waitFor(() => expect(fotoDaLinha()).toBe(antes));
    expect(screen.queryByText(AVISO)).toBeNull();
    expect(h.chamadas).toHaveLength(2);
  }, 30000);

  it("Resetar este mês? e Desfazer: o banco recebe de volta o lançamento e a série", async () => {
    semear("aceita");
    await abrirApp();
    const antes = fotoDaLinha();

    await resetar("Resetar este mês?");
    await waitFor(() => expect(h.chamadas).toHaveLength(1));
    await waitFor(() => expect(fotoDaLinha()).not.toContain(COM_DADOS));

    await desfazer();

    await waitFor(() => expect(h.chamadas).toHaveLength(2));
    const p = h.chamadas[1]!.args.p;
    expect(ids(p.tx_upsert)).toEqual(["t1"]);
    expect(ids(p.rec_upsert)).toEqual(["r1"]);
    await waitFor(() => expect(fotoDaLinha()).toBe(antes));
    expect(screen.queryByText(AVISO)).toBeNull();
    expect(h.chamadas).toHaveLength(2);
  }, 30000);
});

describe("Desfazer do reset: o banco recusa o Desfazer", () => {
  it("aparece o aviso e a tela NÃO finge que voltou", async () => {
    semear("aceita");
    await abrirApp();

    await resetar("Resetar tudo?");
    await waitFor(() => expect(h.chamadas).toHaveLength(1));
    await waitFor(() => expect(fotoDaLinha()).not.toContain(COM_DADOS));
    const vazia = fotoDaLinha();

    h.modo = "recusa";
    await desfazer();

    expect(await screen.findByText(AVISO)).toBeInTheDocument();
    await waitFor(() => expect(h.chamadas).toHaveLength(2));
    await waitFor(() => expect(fotoDaLinha()).toBe(vazia));
    expect(fotoDaLinha()).not.toContain(COM_DADOS);
    expect(h.chamadas).toHaveLength(2);
  }, 30000);
});

describe("Desfazer do reset: o banco recusa o reset", () => {
  it("aviso, tela como era e o Desfazer não manda nada ao banco", async () => {
    semear("recusa");
    await abrirApp();
    const antes = fotoDaLinha();

    await resetar("Resetar tudo?");

    expect(await screen.findByText(AVISO)).toBeInTheDocument();
    await waitFor(() => expect(h.chamadas).toHaveLength(1));
    await waitFor(() => expect(fotoDaLinha()).toBe(antes));

    await desfazer();

    // dá tempo de uma gravação indevida aparecer
    await new Promise((r) => setTimeout(r, 200));
    expect(h.chamadas).toHaveLength(1);
    expect(fotoDaLinha()).toBe(antes);
  }, 30000);
});

describe("Desfazer do reset: apertado antes de o banco responder ao reset", () => {
  it("espera a resposta do reset e só então grava de volta, uma vez só", async () => {
    semear("espera");
    await abrirApp();
    const antes = fotoDaLinha();

    await resetar("Resetar tudo?");
    await waitFor(() => expect(h.chamadas).toHaveLength(1));

    await desfazer();
    await new Promise((r) => setTimeout(r, 200));
    expect(h.chamadas).toHaveLength(1); // ainda esperando o reset

    h.modo = "aceita";
    h.liberar!({ data: null, error: null }); // o banco aceita o reset

    await waitFor(() => expect(h.chamadas).toHaveLength(2));
    expect(ids(h.chamadas[1]!.args.p.tx_upsert)).toEqual(["t1"]);
    await waitFor(() => expect(fotoDaLinha()).toBe(antes));
    await new Promise((r) => setTimeout(r, 200));
    expect(h.chamadas).toHaveLength(2);
  }, 30000);
});
