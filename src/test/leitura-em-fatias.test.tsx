/**
 * FISCAL DA LEITURA EM FATIAS (limite de 1.000 linhas do Supabase)
 *
 * Abre a tela principal (/app) de verdade, com o roteador, o login e o Supabase de mentira.
 * O Supabase de mentira se comporta como o de verdade: se o app não pedir fatia (range), ele devolve
 * no máximo 1.000 linhas e não avisa; se pedir, devolve a fatia e o total exato (count).
 *
 * Provas:
 *  1. 2.500 lançamentos: o app lê tudo em 3 fatias e soma tudo (nenhum fica escondido);
 *  2. a 2ª fatia falha: aparece a tela de erro, nunca um calendário com lista pela metade;
 *  3. o banco corta em 500 (menor que 1.000): o app ainda junta os 1.200 lançamentos;
 *  4. o banco repete uma linha entre duas fatias: ela conta uma vez só;
 *  5. a ordem pedida ao banco é data (do mais novo ao mais velho) e depois id (desempate fixo);
 *  6. poucos lançamentos (o caso de hoje): uma leitura só por lista, como antes.
 *
 * Você (leigo) não precisa abrir nem mexer neste arquivo: ele roda sozinho no GitHub Actions.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HOJE = "2026-11-12";
const TITULO_ERRO = "Não conseguimos carregar seus dados";

const h = vi.hoisted(() => ({
  limite: 1000, // máximo de linhas que o banco devolve por leitura
  falhaNaFatia: null as null | number, // número (0, 1, 2...) da fatia de lançamentos que falha
  repeteUltima: false, // a fatia seguinte repete a última linha da anterior
  leituras: [] as { tabela: string; de: number | null; ate: number | null; ordens: any[] }[],
  gravacoes: [] as string[],
  tabelas: {} as Record<string, any[]>,
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => h.navigate,
}));

vi.mock("@/integrations/supabase/client", () => {
  const tabela = (nome: string) => {
    const q = { tabela: nome, de: null as number | null, ate: null as number | null, ordens: [] as any[], contar: false };
    const c: any = {
      select: (_cols?: string, opcoes?: { count?: string }) => {
        q.contar = opcoes?.count === "exact";
        return c;
      },
      eq: () => c,
      order: (...args: any[]) => {
        q.ordens.push(args);
        return c;
      },
      range: (de: number, ate: number) => {
        q.de = de;
        q.ate = ate;
        return c;
      },
      maybeSingle: async () => ({ data: (h.tabelas[nome] ?? [])[0] ?? null, error: null, status: 200 }),
      then: (ok: any, err: any) => {
        h.leituras.push({ tabela: nome, de: q.de, ate: q.ate, ordens: q.ordens });
        const linhas = h.tabelas[nome] ?? [];
        // Sem pedir fatia, o banco entrega só as primeiras linhas (até o limite) e NÃO avisa.
        const de = q.de ?? 0;
        const ate = Math.min(q.ate ?? de + h.limite - 1, de + h.limite - 1);
        if (nome === "transactions" && q.de !== null && h.falhaNaFatia !== null && Math.floor(q.de / 1000) === h.falhaNaFatia) {
          return Promise.resolve({ data: null, error: { message: "falhou (fiscal)" }, status: 500, count: null }).then(ok, err);
        }
        let fatia = linhas.slice(de, ate + 1);
        if (h.repeteUltima && de > 0) fatia = [linhas[de - 1], ...fatia];
        return Promise.resolve({
          data: fatia,
          error: null,
          status: 200,
          count: q.contar ? linhas.length : null,
        }).then(ok, err);
      },
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
      rpc: (nome: string) => {
        h.gravacoes.push(`rpc ${nome}`);
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

// ---------- dados de mentira ----------

/** N lançamentos de 1,00 real de saída no mesmo dia: a soma do dia mostra quantos chegaram. */
function lancamentos(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    user_id: "u1",
    date: HOJE,
    amount: 1,
    type: "saidas",
    description: `Item ${i}`,
    marketing_tags: [],
  }));
}

function semear(n: number) {
  h.limite = 1000;
  h.falhaNaFatia = null;
  h.repeteUltima = false;
  h.leituras.length = 0;
  h.gravacoes.length = 0;
  h.tabelas = { subscriptions: [{ status: "active" }], transactions: lancamentos(n), recurrences: [], forecasts: [], forecast_day_edits: [] };
}

const linhaDoDia = () => document.querySelector(`[data-day-row="${HOJE}"]`) as HTMLElement | null;
const fotoDaLinha = () => linhaDoDia()?.textContent ?? "SEM LINHA";

async function abrirApp() {
  const App = (Route as any).options.component;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );
}

const lerDeLancamentos = () => h.leituras.filter((l) => l.tabela === "transactions");

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
  expect(h.gravacoes, "ler a lista não pode gravar nada").toEqual([]);
});

describe("Leitura em fatias", () => {
  it("2.500 lançamentos: lê tudo em 3 fatias e soma tudo", async () => {
    semear(2500);
    await abrirApp();
    await waitFor(() => expect(fotoDaLinha()).toContain("2.500,00"));
    expect(lerDeLancamentos().map((l) => [l.de, l.ate])).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("a 2ª fatia falha: tela de erro, nunca calendário com lista pela metade", async () => {
    semear(2500);
    h.falhaNaFatia = 1;
    await abrirApp();
    await screen.findByText(TITULO_ERRO);
    expect(linhaDoDia()).toBeNull();
    expect(screen.queryByText("Você ainda não é assinante")).toBeNull();
  });

  it("o banco corta em 500 (menor que 1.000): ainda junta os 1.200", async () => {
    semear(1200);
    h.limite = 500;
    await abrirApp();
    await waitFor(() => expect(fotoDaLinha()).toContain("1.200,00"));
    expect(lerDeLancamentos().map((l) => l.de)).toEqual([0, 500, 1000]);
  });

  it("o banco repete uma linha entre duas fatias: ela conta uma vez só", async () => {
    semear(1500);
    h.repeteUltima = true;
    await abrirApp();
    await waitFor(() => expect(fotoDaLinha()).toContain("1.500,00"));
    expect(fotoDaLinha()).not.toContain("1.501,00");
  });

  it("pede ao banco a ordem fixa: data (mais novo primeiro) e depois id", async () => {
    semear(3);
    await abrirApp();
    await waitFor(() => expect(fotoDaLinha()).toContain("3,00"));
    expect(lerDeLancamentos()[0]?.ordens).toEqual([["date", { ascending: false }], ["id"]]);
    // séries e orçamento também têm ordem fixa
    for (const tabela of ["recurrences", "forecasts"]) {
      const leitura = h.leituras.find((l) => l.tabela === tabela);
      expect(leitura?.ordens, tabela).toEqual([["id"]]);
    }
  });

  it("poucos lançamentos (o caso de hoje): uma leitura só por lista", async () => {
    semear(3);
    await abrirApp();
    await waitFor(() => expect(fotoDaLinha()).toContain("3,00"));
    for (const tabela of ["transactions", "recurrences", "forecasts"]) {
      expect(h.leituras.filter((l) => l.tabela === tabela), tabela).toHaveLength(1);
    }
  });
});
