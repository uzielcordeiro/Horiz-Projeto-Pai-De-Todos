/**
 * FISCAL DE GRAVAÇÃO
 *
 * Abre a tela principal (/app) de verdade, troca o roteador, o login e o Supabase por
 * versões de mentira e finge que o banco recusou a gravação. Em cada ação que grava, confere:
 *  1. o aviso "Erro ao salvar. Tente de novo." aparece na tela (sonner real, sem espião);
 *  2. a janela com campo digitado continua aberta com o que foi digitado
 *     (nos botões de apagar do item a janela fecha na hora: aí vale só aviso + tela de volta);
 *  3. a tela volta ao que era antes.
 * Cada ação roda duas vezes: com o banco recusando e com o banco aceitando (controle: prova
 * que a ação existe e que o que a tela mostra muda de verdade).
 * Também confere o clique duplo: uma só chamada ao banco e o botão "salvando...".
 *
 * Se este arquivo ficar vermelho depois de uma mudança, a mudança tirou uma proteção.
 * Se for só um texto de botão que mudou, ajuste o texto aqui.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const AVISO = "Erro ao salvar. Tente de novo.";
const HOJE = "2026-11-12";

const h = vi.hoisted(() => ({
  modo: "recusa" as "recusa" | "aceita" | "espera",
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

type Tabelas = {
  transactions: any[];
  recurrences: any[];
  forecasts: any[];
  forecast_day_edits: any[];
};

const lancamento = (id: string, nome: string, valor: number, tipo: string, tags: string[] = []) => ({
  id,
  user_id: "u1",
  date: HOJE,
  amount: valor,
  type: tipo,
  description: nome,
  marketing_tags: tags,
});

const serie = (id: string, nome: string, valor: number, tipo: string, inicio: string, extra: object = {}) => ({
  payload: {
    id,
    kind: tipo,
    name: nome,
    label: nome,
    tags: [],
    amount: valor,
    freq: "monthly",
    daysOfMonth: [Number(inicio.slice(8, 10))],
    daysOfWeek: [],
    startDate: inicio,
    installments: 6,
    endDate: null,
    skipped: [],
    ...extra,
  },
});

const gasto = (id: string, nome: string, valor: number) => ({
  payload: { id, name: nome, amount: valor, period: "mensal", tags: [] },
});

function semear(modo: "recusa" | "aceita" | "espera", dados: Partial<Tabelas>) {
  h.modo = modo;
  h.chamadas.length = 0;
  h.gravacoesDesconhecidas.length = 0;
  h.liberar = null;
  h.tabelas = {
    subscriptions: [{ status: "active" }],
    transactions: [],
    recurrences: [],
    forecasts: [],
    forecast_day_edits: [],
    ...dados,
  };
}

// ---------- ajudantes de tela ----------

const limpa = (t: string) => t.trim().replace(/^[^\p{L}\p{N}]+/u, "");
const nomeDe = (el: Element) => limpa(el.getAttribute("aria-label") ?? el.textContent ?? "");
const casa = (el: Element, nome: string | RegExp) => (typeof nome === "string" ? nomeDe(el) === nome : nome.test(nomeDe(el)));
const SELETOR = { button: "button", menuitem: '[role="menuitem"]', dialog: '[role="dialog"]' } as const;
// Procura direto no HTML (muito mais rápido que getByRole no jsdom).
const achar = (papel: keyof typeof SELETOR, nome: string | RegExp, raiz: ParentNode = document.body) =>
  Array.from(raiz.querySelectorAll(SELETOR[papel])).find((el) => casa(el, nome)) as HTMLElement | undefined;
const esperarPor = (papel: keyof typeof SELETOR, nome: string | RegExp, raiz: ParentNode = document.body) =>
  waitFor(() => {
    const el = achar(papel, nome, raiz);
    if (!el) throw new Error(`não achei ${papel} "${String(nome)}"`);
    return el;
  });
const dialogo = () => document.querySelector('[role="dialog"]') as HTMLElement;
const temDialogo = () => document.querySelector('[role="dialog"]') !== null;
const normaliza = (v: string) => (/^[\d.,]+$/.test(v) ? String(parseFloat(v.replace(",", "."))) : v);
const camposDaJanela = () => Array.from(dialogo().querySelectorAll("input")).map((i) => normaliza((i as HTMLInputElement).value));
const clicar = (nome: string | RegExp, dentro: HTMLElement = document.body) => {
  const el = achar("button", nome, dentro);
  if (!el) throw new Error(`botão "${String(nome)}" não existe na tela`);
  fireEvent.click(el);
};
const clicarItemDeMenu = (nome: string | RegExp) => {
  const el = achar("menuitem", nome, dialogo());
  if (!el) throw new Error(`item de menu "${String(nome)}" não existe`);
  fireEvent.click(el);
};
const digitar = (placeholder: string, valor: string) =>
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value: valor } });

const linhaDoDia = () => document.querySelector(`[data-day-row="${HOJE}"]`) as HTMLElement;
const celula = (tipo: string) => linhaDoDia().querySelector(`[data-kind="${tipo}"]`) as HTMLElement;
const fotoDaLinha = () => linhaDoDia()?.textContent ?? "SEM LINHA";
const fotoDaTela = () => {
  const main = document.querySelector("main")?.cloneNode(true) as HTMLElement | undefined;
  main?.querySelectorAll('[role="dialog"]').forEach((d) => d.remove());
  return main?.textContent ?? "SEM TELA";
};
const fotoDaProjecao = () => document.querySelector(`[data-horizon-day="${HOJE}"]`)?.textContent ?? "SEM CELULA";

async function abrirApp() {
  const App = (Route as any).options.component;
  render(<App />);
  await esperarPor("button", "Novo");
}

async function abrirNovo() {
  await abrirApp();
  clicar("Novo");
  await screen.findByPlaceholderText("0,00");
}

async function abrirItem(tipo: string, nome: RegExp) {
  await abrirApp();
  await waitFor(() => expect(celula(tipo)).toBeTruthy());
  fireEvent.click(celula(tipo));
  fireEvent.click(await esperarPor("button", nome));
  await esperarPor("button", "apagar");
}

async function abrirEdicao(tipo: string, nome: RegExp) {
  await abrirItem(tipo, nome);
  clicar("editar", dialogo());
  await esperarPor("button", "salvar alterações");
}

async function abrirApagar(tipo: string, nome: RegExp, acao: string) {
  await abrirItem(tipo, nome);
  clicar("apagar", dialogo());
  clicarItemDeMenu(acao);
}

async function abrirAjusteDePoupanca() {
  await abrirApp();
  await waitFor(() => expect(celula("economias")).toBeTruthy());
  fireEvent.click(celula("economias"));
  fireEvent.click(await esperarPor("button", /ir para a Projeção/));
  await esperarPor("dialog", "ajustar poupança");
}

async function abrirDiaADia() {
  await abrirApp();
  await waitFor(() => expect(celula("diarios")).toBeTruthy());
  fireEvent.click(celula("diarios"));
  await screen.findByPlaceholderText("gastei outro valor");
}

async function abrirQuadroDiaADia() {
  await abrirApp();
  clicar("Dia/Dia");
  await esperarPor("button", "adicionar");
}

async function abrirTag() {
  await abrirApp();
  clicar("Tags");
  fireEvent.click(await esperarPor("button", "editar tag mercado"));
  await screen.findByPlaceholderText("nome da tag");
}

// ---------- cenários ----------

type Cenario = {
  nome: string;
  dados: Partial<Tabelas>;
  preparar: () => Promise<void>;
  agir: () => void;
  foto: () => string;
  /** true: com o banco recusando, a janela continua aberta com o que foi digitado. */
  janelaFica: boolean;
  /** false: mesmo com o banco aceitando, a janela continua aberta (só o "restaurar"). */
  fechaAoGravar?: boolean;
  /** true: a série continua aparecendo igual na linha do dia, então a tela não muda de jeito visível. */
  telaIgual?: boolean;
  conferir: (p: any) => void;
};

const mercado = [lancamento("t1", "Mercado teste", 50, "saidas")];
const aluguel = [serie("r1", "Aluguel teste", 80, "saidas", "2026-10-12")];
const aluguelHoje = [serie("r1", "Aluguel teste", 80, "saidas", HOJE)];
const poupanca = [lancamento("p1", "Reserva teste", 100, "economias", ["horizon_transfer"])];
const poupancaSerie = [serie("r2", "Reserva serie", 100, "economias", HOJE, { horizonTransfer: true })];
const orcamento = [gasto("f1", "mercado", 300)];

const cenarios: Cenario[] = [
  // --- adicionar entradas ---
  {
    nome: "adicionar entradas, não repete",
    dados: {},
    preparar: async () => {
      await abrirNovo();
      digitar("0,00", "12");
    },
    agir: () => clicar("adicionar entradas"),
    foto: fotoDaLinha,
    janelaFica: true,
    conferir: (p) => {
      expect(p.tx_upsert).toHaveLength(1);
      expect(p.tx_upsert[0]).toMatchObject({ amount: 12, type: "entradas", date: HOJE });
    },
  },
  {
    nome: "adicionar entradas, mensal com 3 parcelas",
    dados: {},
    preparar: async () => {
      await abrirNovo();
      digitar("0,00", "12");
      clicar("mensal");
      fireEvent.change(screen.getByLabelText("parcelas"), { target: { value: "3" } });
    },
    agir: () => clicar("adicionar entradas"),
    foto: fotoDaLinha,
    janelaFica: true,
    conferir: (p) => {
      expect(p.rec_upsert).toHaveLength(1);
      expect(p.rec_upsert[0].payload).toMatchObject({ freq: "monthly", installments: 3, amount: 12 });
    },
  },

  // --- as 4 vias de edição do saveEntry ---
  {
    nome: "editar lançamento avulso (avulso para avulso)",
    dados: { transactions: mercado },
    preparar: async () => {
      await abrirEdicao("saidas", /Mercado teste/);
      digitar("0,00", "60");
    },
    agir: () => clicar("salvar alterações"),
    foto: fotoDaLinha,
    janelaFica: true,
    conferir: (p) => {
      expect(p.tx_upsert).toHaveLength(1);
      expect(p.tx_upsert[0]).toMatchObject({ id: "t1", amount: 60 });
    },
  },
  {
    nome: "editar lançamento avulso para virar série (avulso para série)",
    telaIgual: true,
    dados: { transactions: mercado },
    preparar: async () => {
      await abrirEdicao("saidas", /Mercado teste/);
      clicar("mensal");
      fireEvent.change(screen.getByLabelText("parcelas"), { target: { value: "3" } });
    },
    agir: () => clicar("salvar alterações"),
    foto: fotoDaLinha,
    janelaFica: true,
    conferir: (p) => {
      expect(p.tx_delete).toEqual(["t1"]);
      expect(p.rec_upsert).toHaveLength(1);
      expect(p.rec_upsert[0].payload).toMatchObject({ freq: "monthly", installments: 3, amount: 50 });
    },
  },
  {
    nome: "editar série (série para série)",
    dados: { recurrences: aluguel },
    preparar: async () => {
      await abrirEdicao("saidas", /Aluguel teste/);
      digitar("0,00", "90");
    },
    agir: () => clicar("salvar alterações"),
    foto: fotoDaLinha,
    janelaFica: true,
    conferir: (p) => {
      expect(p.rec_upsert).toHaveLength(1);
      expect(p.rec_upsert[0].payload).toMatchObject({ id: "r1", amount: 90 });
    },
  },
  {
    nome: "editar série para virar avulso (série para avulso)",
    telaIgual: true,
    dados: { recurrences: aluguelHoje },
    preparar: async () => {
      await abrirEdicao("saidas", /Aluguel teste/);
      clicar("não repete");
    },
    agir: () => clicar("salvar alterações"),
    foto: fotoDaLinha,
    janelaFica: true,
    conferir: (p) => {
      expect(p.rec_delete).toEqual(["r1"]);
      expect(p.tx_upsert).toHaveLength(1);
      expect(p.tx_upsert[0]).toMatchObject({ amount: 80, date: HOJE, type: "saidas" });
    },
  },

  // --- ajustar poupança (Projeção) ---
  {
    nome: "ajustar poupança, salvar (lançamento avulso)",
    dados: { transactions: poupanca },
    preparar: async () => {
      await abrirAjusteDePoupanca();
      digitar("0,00", "60");
    },
    agir: () => clicar("salvar", dialogo()),
    foto: fotoDaProjecao,
    janelaFica: true,
    conferir: (p) => {
      expect(p.tx_upsert).toHaveLength(1);
      expect(p.tx_upsert[0]).toMatchObject({ id: "p1", amount: 60 });
    },
  },
  {
    nome: "ajustar poupança, desfazer (lançamento avulso)",
    dados: { transactions: poupanca },
    preparar: abrirAjusteDePoupanca,
    agir: () => clicar("desfazer", dialogo()),
    foto: fotoDaProjecao,
    janelaFica: true,
    conferir: (p) => {
      expect(p.tx_delete).toEqual(["p1"]);
    },
  },
  {
    nome: "ajustar poupança, salvar só este dia (série)",
    dados: { recurrences: poupancaSerie },
    preparar: async () => {
      await abrirAjusteDePoupanca();
      digitar("0,00", "60");
      clicar("salvar", dialogo());
      await esperarPor("button", "só este dia");
    },
    agir: () => clicar("só este dia", dialogo()),
    foto: fotoDaProjecao,
    janelaFica: true,
    conferir: (p) => {
      expect(p.rec_upsert[0].payload.skipped).toContain(HOJE);
      expect(p.tx_upsert).toHaveLength(1);
      expect(p.tx_upsert[0]).toMatchObject({ amount: 60, type: "economias" });
    },
  },

  // --- janela do Dia/Dia no Calendário ---
  {
    nome: "Dia/Dia, gastei outro valor (salvar)",
    dados: { forecasts: orcamento },
    preparar: async () => {
      await abrirDiaADia();
      digitar("gastei outro valor", "5");
    },
    agir: () => clicar("salvar", dialogo()),
    foto: fotoDaLinha,
    janelaFica: true,
    conferir: (p) => {
      expect(p.day_edits).toEqual({ [HOJE]: 5 });
    },
  },
  {
    nome: "Dia/Dia, restaurar",
    dados: { forecasts: orcamento, forecast_day_edits: [{ edits: { [HOJE]: 20 } }] },
    preparar: abrirDiaADia,
    agir: () => clicar("restaurar", dialogo()),
    foto: fotoDaLinha,
    janelaFica: true,
    fechaAoGravar: false,
    conferir: (p) => {
      expect(p.day_edits).toEqual({});
    },
  },
  {
    nome: "Dia/Dia, apagar valor e \"sim, apagar\"",
    dados: { forecasts: orcamento },
    preparar: async () => {
      await abrirDiaADia();
      clicar("apagar valor", dialogo());
      await esperarPor("button", "sim, apagar");
    },
    agir: () => clicar("sim, apagar", dialogo()),
    foto: fotoDaLinha,
    janelaFica: true,
    conferir: (p) => {
      expect(p.day_edits).toEqual({ [HOJE]: null });
    },
  },

  // --- quadro da aba Dia/Dia ---
  {
    nome: "quadro Dia/Dia, cadastrar gasto",
    dados: { forecasts: orcamento },
    preparar: async () => {
      await abrirQuadroDiaADia();
      clicar("adicionar");
      fireEvent.change(await screen.findByPlaceholderText("mercado, gasolina, lanches…"), {
        target: { value: "lanche teste" },
      });
      digitar("450,00", "40");
    },
    agir: () => clicar("salvar", dialogo()),
    foto: fotoDaTela,
    janelaFica: true,
    conferir: (p) => {
      expect(p.fc_upsert).toHaveLength(1);
      expect(p.fc_upsert[0].payload).toMatchObject({ name: "lanche teste", amount: 40 });
    },
  },
  {
    nome: "quadro Dia/Dia, editar gasto",
    dados: { forecasts: orcamento },
    preparar: async () => {
      await abrirQuadroDiaADia();
      fireEvent.click(Array.from(document.querySelectorAll("button")).find((b) => /mercado/.test(nomeDe(b)))!);
      await screen.findByPlaceholderText("450,00");
      digitar("450,00", "350");
    },
    agir: () => clicar("salvar", dialogo()),
    foto: fotoDaTela,
    janelaFica: true,
    conferir: (p) => {
      expect(p.fc_upsert).toHaveLength(1);
      expect(p.fc_upsert[0].payload).toMatchObject({ id: "f1", amount: 350 });
    },
  },
  {
    nome: "quadro Dia/Dia, apagar gasto",
    dados: { forecasts: orcamento },
    preparar: async () => {
      await abrirQuadroDiaADia();
      fireEvent.click(Array.from(document.querySelectorAll("button")).find((b) => /mercado/.test(nomeDe(b)))!);
      await screen.findByPlaceholderText("450,00");
      clicar("apagar", dialogo());
      await esperarPor("menuitem", "tenho certeza");
    },
    agir: () => clicarItemDeMenu("tenho certeza"),
    foto: fotoDaTela,
    janelaFica: true,
    conferir: (p) => {
      expect(p.fc_delete).toEqual(["f1"]);
    },
  },

  // --- aba Tags ---
  {
    nome: "Tags, renomear",
    dados: { transactions: [lancamento("t1", "Mercado teste", 50, "saidas", ["mercado"])] },
    preparar: async () => {
      await abrirTag();
      digitar("nome da tag", "supermercado");
    },
    agir: () => clicar("salvar", dialogo()),
    foto: fotoDaTela,
    janelaFica: true,
    conferir: (p) => {
      expect(p.tx_upsert).toHaveLength(1);
      expect(p.tx_upsert[0]).toMatchObject({ id: "t1", marketing_tags: ["supermercado"] });
    },
  },
  {
    nome: "Tags, apagar",
    dados: { transactions: [lancamento("t1", "Mercado teste", 50, "saidas", ["mercado"])] },
    preparar: async () => {
      await abrirTag();
      clicar("apagar", dialogo());
      clicarItemDeMenu("apagar esta tag");
    },
    agir: () => clicarItemDeMenu("confirmar"),
    foto: fotoDaTela,
    janelaFica: true,
    conferir: (p) => {
      expect(p.tx_upsert).toHaveLength(1);
      expect(p.tx_upsert[0]).toMatchObject({ id: "t1", marketing_tags: [] });
    },
  },

  // --- os 4 botões de apagar da janela do item (a janela fecha na hora) ---
  {
    nome: "apagar só este lançamento",
    dados: { recurrences: aluguel },
    preparar: () => abrirApagar("saidas", /Aluguel teste/, "apagar só este lançamento"),
    agir: () => clicarItemDeMenu("confirmar"),
    foto: fotoDaLinha,
    janelaFica: false,
    conferir: (p) => {
      expect(p.rec_upsert).toHaveLength(1);
      expect(p.rec_upsert[0].payload.skipped).toEqual([HOJE]);
    },
  },
  {
    nome: "apagar desta data em diante",
    dados: { recurrences: aluguel },
    preparar: () => abrirApagar("saidas", /Aluguel teste/, "apagar desta data em diante"),
    agir: () => clicarItemDeMenu("confirmar"),
    foto: fotoDaLinha,
    janelaFica: false,
    conferir: (p) => {
      expect(p.rec_upsert).toHaveLength(1);
      expect(p.rec_upsert[0].payload.endDate).toBe("2026-11-11");
    },
  },
  {
    nome: "apagar recorrência inteira",
    dados: { recurrences: aluguel },
    preparar: () => abrirApagar("saidas", /Aluguel teste/, "apagar recorrência inteira"),
    agir: () => clicarItemDeMenu("confirmar"),
    foto: fotoDaLinha,
    janelaFica: false,
    conferir: (p) => {
      expect(p.rec_delete).toEqual(["r1"]);
    },
  },
  {
    nome: "apagar lançamento",
    dados: { transactions: mercado },
    preparar: () => abrirApagar("saidas", /Mercado teste/, "apagar lançamento"),
    agir: () => clicarItemDeMenu("confirmar"),
    foto: fotoDaLinha,
    janelaFica: false,
    conferir: (p) => {
      expect(p.tx_delete).toEqual(["t1"]);
    },
  },
];

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
  // O banco de mentira só conhece a função salvar_calendario. Qualquer outro jeito de
  // gravar deixa o fiscal cego: avise aqui e ensine o fiscal a conhecer o caminho novo.
  expect(h.gravacoesDesconhecidas, "o app gravou por um caminho que o fiscal não conhece").toEqual([]);
});

// ---------- as provas ----------

describe("fiscal de gravação: banco recusa", () => {
  for (const c of cenarios) {
    it(
      c.nome,
      async () => {
        semear("recusa", c.dados);
        await c.preparar();
        const antes = c.foto();
        const camposAntes = c.janelaFica ? camposDaJanela() : [];

        c.agir();

        expect(await screen.findByText(AVISO)).toBeInTheDocument();
        await waitFor(() => expect(h.chamadas).toHaveLength(1));
        expect(h.chamadas[0]!.nome).toBe("salvar_calendario");
        if (c.janelaFica) {
          expect(temDialogo()).toBe(true);
          expect(camposDaJanela()).toEqual(camposAntes);
        } else {
          await waitFor(() => expect(temDialogo()).toBe(false));
        }
        await waitFor(() => expect(c.foto()).toBe(antes));
        expect(h.chamadas).toHaveLength(1);
      },
      20000,
    );
  }
});

describe("fiscal de gravação: banco aceita (controle)", () => {
  for (const c of cenarios) {
    it(
      c.nome,
      async () => {
        semear("aceita", c.dados);
        await c.preparar();
        const antes = c.foto();

        c.agir();

        await waitFor(() => expect(h.chamadas).toHaveLength(1));
        expect(h.chamadas[0]!.nome).toBe("salvar_calendario");
        c.conferir(h.chamadas[0]!.args.p);
        if (c.fechaAoGravar !== false) await waitFor(() => expect(temDialogo()).toBe(false));
        if (!c.telaIgual) await waitFor(() => expect(c.foto()).not.toBe(antes));
        expect(screen.queryByText(AVISO)).toBeNull();
        expect(h.chamadas).toHaveLength(1);
      },
      20000,
    );
  }
});

describe("fiscal de gravação: clique duplo em adicionar entradas", () => {
  it("clicar duas vezes faz uma gravação só e o botão mostra salvando...", async () => {
    semear("espera", {});
    await abrirNovo();
    digitar("0,00", "7");
    const botao = achar("button", "adicionar entradas")!;

    fireEvent.click(botao);
    fireEvent.click(botao);

    expect(h.chamadas).toHaveLength(1);
    expect(achar("button", "salvando...")!).toBeDisabled();
    h.liberar!({ data: null, error: null });
    await waitFor(() => expect(temDialogo()).toBe(false));
    expect(h.chamadas).toHaveLength(1);
  }, 20000);

  it("enviar o formulário duas vezes (Enter) faz uma gravação só", async () => {
    semear("espera", {});
    await abrirNovo();
    digitar("0,00", "7");
    const formulario = achar("button", "adicionar entradas")!.closest("form")!;

    fireEvent.submit(formulario);
    fireEvent.submit(formulario);

    expect(h.chamadas).toHaveLength(1);
    h.liberar!({ data: null, error: null });
    await waitFor(() => expect(temDialogo()).toBe(false));
    expect(h.chamadas).toHaveLength(1);
  }, 20000);
});
