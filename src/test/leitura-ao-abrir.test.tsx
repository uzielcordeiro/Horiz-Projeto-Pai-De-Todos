/**
 * FISCAL DA LEITURA AO ABRIR O CALENDÁRIO
 *
 * Abre a tela principal (/app) de verdade, com o roteador, o login e o Supabase de mentira.
 * Ao abrir, o app lê 5 coisas do banco (lançamentos, séries, orçamento, assinatura e os valores
 * editados do Dia/Dia). Este arquivo confere o que acontece quando essa leitura FALHA:
 *
 *  1. falha em qualquer uma das 5: aparece "Não conseguimos carregar seus dados" e o app NÃO mostra
 *     o calendário vazio, NÃO diz "Você ainda não é assinante" e NÃO grava nada;
 *  2. sessão expirada (erro 401): aparece "Sua sessão expirou" com o botão "Sair da conta";
 *  3. "Tentar de novo": quando a leitura volta a funcionar, o calendário abre normal.
 *
 * Você (leigo) não precisa abrir nem mexer neste arquivo: ele roda sozinho no GitHub Actions.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HOJE = "2026-11-12";
const COM_DADOS = "130,00";
const TITULO_ERRO = "Não conseguimos carregar seus dados";

const h = vi.hoisted(() => ({
  // qual tabela falha (null = nenhuma) e como
  falha: null as null | { tabela: string; tipo: "rede" | "sessao"; vezes: number },
  chamadas: [] as { nome: string; args: any }[],
  gravacoes: [] as string[],
  tabelas: {} as Record<string, any[]>,
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => h.navigate,
}));

vi.mock("@/integrations/supabase/client", () => {
  const resposta = (nome: string, uma: boolean) => {
    const f = h.falha;
    if (f && f.tabela === nome && f.vezes > 0) {
      f.vezes -= 1;
      return f.tipo === "sessao"
        ? { data: null, error: { message: "JWT expired", code: "PGRST301" }, status: 401 }
        : { data: null, error: { message: "TypeError: Failed to fetch" }, status: 0 };
    }
    const linhas = h.tabelas[nome] ?? [];
    return { data: uma ? (linhas[0] ?? null) : linhas, error: null, status: 200 };
  };
  const tabela = (nome: string) => {
    const c: any = {
      select: () => c,
      eq: () => c,
      order: () => c,
      maybeSingle: async () => resposta(nome, true),
      then: (ok: any, err: any) => Promise.resolve(resposta(nome, false)).then(ok, err),
    };
    for (const metodo of ["insert", "upsert", "update", "delete"]) {
      c[metodo] = () => {
        h.gravacoes.push(`${nome}.${metodo}`);
        return Promise.resolve({ data: null, error: { message: "gravação (fiscal)" } });
      };
    }
    return c;
  };
  return {
    supabase: {
      from: (nome: string) => tabela(nome),
      rpc: (nome: string, args: unknown) => {
        h.chamadas.push({ nome, args });
        return Promise.resolve({ data: null, error: null });
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

const DADOS = {
  subscriptions: [{ status: "active" }],
  transactions: [
    { id: "t1", user_id: "u1", date: HOJE, amount: 50, type: "saidas", description: "Mercado teste", marketing_tags: [] },
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

function semear(falha: typeof h.falha) {
  h.falha = falha;
  h.chamadas.length = 0;
  h.gravacoes.length = 0;
  h.tabelas = JSON.parse(JSON.stringify(DADOS));
}

const linhaDoDia = () => document.querySelector(`[data-day-row="${HOJE}"]`) as HTMLElement | null;

async function abrirApp() {
  const App = (Route as any).options.component;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );
}

async function esperarTelaDeErro() {
  await screen.findByText(TITULO_ERRO);
}

function conferirQueNaoFingiuNada() {
  expect(screen.queryByText("Você ainda não é assinante")).toBeNull();
  expect(screen.queryByText("Acesso Suspenso")).toBeNull();
  expect(linhaDoDia()).toBeNull();
  expect(h.chamadas).toEqual([]);
  expect(h.gravacoes).toEqual([]);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 12, 12));
  localStorage.clear();
  Element.prototype.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Leitura ao abrir: o banco falha em uma das 5 leituras", () => {
  for (const tabela of ["transactions", "recurrences", "forecasts", "subscriptions", "forecast_day_edits"]) {
    it(`falha em ${tabela}: tela de erro, sem calendário vazio e sem gravar`, async () => {
      semear({ tabela, tipo: "rede", vezes: 99 });
      await abrirApp();
      await esperarTelaDeErro();
      expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeTruthy();
      conferirQueNaoFingiuNada();
    });
  }
});

describe("Leitura ao abrir: sessão expirada", () => {
  it("erro 401: avisa que a sessão expirou e oferece sair da conta", async () => {
    semear({ tabela: "transactions", tipo: "sessao", vezes: 99 });
    await abrirApp();
    await screen.findByText("Sua sessão expirou");
    expect(screen.getByRole("button", { name: "Sair da conta" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
    conferirQueNaoFingiuNada();
  });
});

describe("Leitura ao abrir: Tentar de novo", () => {
  it("a leitura volta a funcionar: o calendário abre com os dados", async () => {
    semear({ tabela: "subscriptions", tipo: "rede", vezes: 1 });
    await abrirApp();
    await esperarTelaDeErro();

    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

    await waitFor(() => expect(linhaDoDia()?.textContent ?? "").toContain(COM_DADOS));
    expect(screen.queryByText(TITULO_ERRO)).toBeNull();
    expect(h.gravacoes).toEqual([]);
  });

  it("a leitura continua falhando: a tela de erro volta e nada é gravado", async () => {
    semear({ tabela: "subscriptions", tipo: "rede", vezes: 99 });
    await abrirApp();
    await esperarTelaDeErro();

    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

    await esperarTelaDeErro();
    conferirQueNaoFingiuNada();
  });
});
