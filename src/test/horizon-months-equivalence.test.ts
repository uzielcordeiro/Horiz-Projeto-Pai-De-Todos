import { describe, expect, it } from "vitest";
import { horizonMonthRange } from "@/lib/calendar-navigation";
import { cents } from "@/lib/money-format";
import { isoOf, occurrencesInMonth, occurrencesUntil, sumBefore, type Recurrence } from "@/lib/recurrence";

/**
 * FISCAL DA PROJEÇÃO: método novo igual ao antigo
 *
 * A Projeção (horizonMonths, dentro do app.tsx) monta o saldo de 121 meses ou mais.
 * Antes, cada série (salário, aluguel, Dia/Dia...) gerava sua lista do zero uma vez por mês.
 * Agora gera uma vez só, até o fim do último mês, e separa o que veio antes do 1º mês (saldo de abertura).
 *
 * O código real mora dentro do app.tsx e o teste não consegue importá-lo. Por isso este arquivo
 * guarda uma cópia do método ANTIGO e uma do método NOVO e exige resultado idêntico:
 * saldo de cada dia, saldo de abertura, setas de entrada e de saída.
 * Se ficar vermelho, o método novo muda algum número da Projeção.
 */

type Item = { kind: Recurrence["kind"]; date: string; amount: number; horizonTransfer?: boolean };
type Day = { date: string; balance: number; hasIncome: boolean; hasExpense: boolean };
type Month = { y: number; m: number; days: Day[] };
type Acc = { opening: number; byDate: Map<string, number>; incomeDays: Set<string>; expenseDays: Set<string> };

const lastDay = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

// mesma regra do balanceSign do app.tsx: entradas +, saídas, Dia/Dia e cartão -, poupança 0 (-1 se for transferência da Projeção)
const sinal = (kind: Recurrence["kind"], horizonTransfer?: boolean): 1 | -1 | 0 => {
  if (kind === "economias" && horizonTransfer) return -1;
  if (kind === "entradas") return 1;
  if (kind === "economias") return 0;
  return -1;
};

const marcaSetas = (acc: Acc, kind: Recurrence["kind"], date: string) => {
  if (kind === "entradas") acc.incomeDays.add(date);
  else if (kind !== "diarios") acc.expenseDays.add(date);
};

const somaNoDia = (acc: Acc, date: string, valor: number) =>
  acc.byDate.set(date, cents((acc.byDate.get(date) ?? 0) + valor));

function lancamentosUnicos(entries: Item[], first: string): Acc {
  const acc: Acc = { opening: 0, byDate: new Map(), incomeDays: new Set(), expenseDays: new Set() };
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  for (const e of sorted) {
    const s = sinal(e.kind, e.horizonTransfer);
    if (e.date < first) acc.opening = cents(acc.opening + s * e.amount);
    else somaNoDia(acc, e.date, s * e.amount);
    marcaSetas(acc, e.kind, e.date);
  }
  return acc;
}

// CÓPIA do método ANTIGO (uma lista por série por mês)
function metodoAntigo(entries: Item[], recurrences: Recurrence[], range: { y: number; m: number }[]): Acc {
  const first = isoOf(range[0]!.y, range[0]!.m, 1);
  const acc = lancamentosUnicos(entries, first);
  for (const r of recurrences) {
    const s = sinal(r.kind, r.horizonTransfer);
    acc.opening = cents(acc.opening + s * sumBefore(r, first));
    for (const { y, m } of range) {
      for (const o of occurrencesInMonth(r, y, m)) {
        somaNoDia(acc, o.date, sinal(o.kind, o.horizonTransfer) * o.amount);
        marcaSetas(acc, o.kind, o.date);
      }
    }
  }
  return acc;
}

// CÓPIA do método NOVO (uma lista por série, até o fim do último mês)
function metodoNovo(entries: Item[], recurrences: Recurrence[], range: { y: number; m: number }[]): Acc {
  const first = isoOf(range[0]!.y, range[0]!.m, 1);
  const lastMonth = range[range.length - 1]!;
  const lastEnd = isoOf(lastMonth.y, lastMonth.m, lastDay(lastMonth.y, lastMonth.m));
  const acc = lancamentosUnicos(entries, first);
  for (const r of recurrences) {
    const s = sinal(r.kind, r.horizonTransfer);
    let before = 0;
    for (const o of occurrencesUntil(r, lastEnd)) {
      if (o.date < first) {
        before = cents(before + o.amount);
        continue;
      }
      somaNoDia(acc, o.date, sinal(o.kind, o.horizonTransfer) * o.amount);
      marcaSetas(acc, o.kind, o.date);
    }
    acc.opening = cents(acc.opening + s * before);
  }
  return acc;
}

// parte que o app.tsx não muda: do saldo de abertura e dos totais por dia, monta os meses
function montaMeses(acc: Acc, range: { y: number; m: number }[]): Month[] {
  let running = acc.opening;
  return range.map(({ y, m }) => ({
    y,
    m,
    days: Array.from({ length: lastDay(y, m) }, (_, i) => {
      const date = isoOf(y, m, i + 1);
      running = cents(running + (acc.byDate.get(date) ?? 0));
      return { date, balance: running, hasIncome: acc.incomeDays.has(date), hasExpense: acc.expenseDays.has(date) };
    }),
  }));
}

const serie = (id: string, changes: Partial<Recurrence>): Recurrence => ({
  id,
  kind: "saidas",
  name: id,
  label: id,
  amount: 100,
  freq: "monthly",
  daysOfMonth: [10],
  daysOfWeek: [],
  startDate: "2026-01-10",
  installments: null,
  skipped: [],
  endDate: null,
  ...changes,
});

const dia = (id: string, changes: Partial<Recurrence>): Recurrence =>
  serie(id, { freq: "daily", daysOfMonth: [], ...changes });

const semana = (id: string, changes: Partial<Recurrence>): Recurrence =>
  serie(id, { freq: "weekly", daysOfMonth: [], daysOfWeek: [1, 3], ...changes });

const SERIES: Recurrence[] = [
  serie("salario", { kind: "entradas", amount: 3000, daysOfMonth: [5], startDate: "2025-02-05" }),
  serie("aluguel dia 31", { amount: 1200.5, daysOfMonth: [31], startDate: "2026-01-31" }),
  serie("vários dias", { amount: 33.33, daysOfMonth: [1, 15, 31], startDate: "2026-06-01" }),
  serie("parcelado 6x, começa antes do 1º mês", { kind: "cartao", amount: 199.9, installments: 6, startDate: "2025-06-10" }),
  serie("parcelado 12x", { kind: "cartao", amount: 77.77, installments: 12, startDate: "2025-03-10" }),
  serie("mensal com data final", { kind: "entradas", amount: 450, daysOfMonth: [15], startDate: "2025-01-15", endDate: "2027-06-30" }),
  serie("mensal com dia pulado", { amount: 80, daysOfMonth: [5], startDate: "2026-01-05", skipped: ["2026-12-05"] }),
  serie("parcelado que passa do último mês", { amount: 25, installments: 3, startDate: "2036-10-10" }),
  serie("começa depois do último mês", { kind: "entradas", amount: 10, startDate: "2040-01-10" }),
  semana("semanal sem fim", { amount: 15, startDate: "2025-09-03" }),
  semana("semanal só no mês de início", { amount: 12.5, daysOfWeek: [6], installments: 4, weeklyWithinStartMonth: true, startDate: "2026-11-08" }),
  semana("semanal parcelado", { kind: "entradas", amount: 60, daysOfWeek: [5], installments: 10, startDate: "2026-11-06" }),
  dia("diária 40x", { amount: 7.77, installments: 40, startDate: "2026-11-20" }),
  dia("diária 30x que acaba antes do 1º mês", { kind: "entradas", amount: 3, installments: 30, startDate: "2024-01-10" }),
  dia("diária dias escolhidos", { amount: 9, daysOfMonth: [31, 8, 15], installments: 3, startDate: "2026-12-08" }),
  dia("diária sem fim com dia pulado", { kind: "diarios", amount: 12, startDate: "2026-11-01", skipped: ["2026-11-08"] }),
  dia("Dia/Dia com dias editados", {
    id: "forecast-auto",
    kind: "diarios",
    amount: 0,
    monthlyBudget: 3000,
    weeklyBudget: 0,
    startDate: "2026-11-01",
    dayEdits: { "2026-11-06": null, "2026-11-10": 50, "2026-12-15": 80, "2027-02-28": null, "2030-07-01": 0 },
  }),
  dia("Dia/Dia semanal sem edições", { kind: "diarios", amount: 0, monthlyBudget: 1234.56, weeklyBudget: 70, startDate: "2026-11-01" }),
  serie("poupança da Projeção (transferência)", { kind: "economias", amount: 100, daysOfMonth: [20], startDate: "2026-01-20", horizonTransfer: true }),
  serie("poupança comum", { kind: "economias", amount: 50, daysOfMonth: [20], startDate: "2026-01-20" }),
];

const LANCAMENTOS: Item[] = [
  { kind: "entradas", date: "2025-01-10", amount: 1000 },
  { kind: "saidas", date: "2025-12-24", amount: 310.45 },
  { kind: "entradas", date: "2026-11-15", amount: 20 },
  { kind: "saidas", date: "2026-11-15", amount: 50.5 },
  { kind: "diarios", date: "2026-11-16", amount: 9.99 },
  { kind: "economias", date: "2030-03-03", amount: 100, horizonTransfer: true },
  { kind: "economias", date: "2030-03-04", amount: 75 },
  { kind: "cartao", date: "2036-11-30", amount: 5 },
];

// datas fixas, para o teste dar sempre o mesmo resultado: hoje 12/11/2026, limite de voltar out/2025, vai até nov/2036
const HOJE = new Date(2026, 10, 12);
const LIMITE = { y: 2025, m: 9 };
// RANGE: a pessoa voltou com as setas até o limite. RANGE_HOJE: a Projeção recém-aberta, no mês de hoje.
const RANGE = horizonMonthRange(LIMITE, HOJE, LIMITE);
const RANGE_HOJE = horizonMonthRange({ y: 2026, m: 10 }, HOJE, LIMITE);
const PERIODOS: [string, { y: number; m: number }[]][] = [
  ["voltando até o limite (out/2025)", RANGE],
  ["aberta no mês de hoje (nov/2026)", RANGE_HOJE],
];

describe("Projeção: método novo (uma lista por série) igual ao antigo (uma lista por mês)", () => {
  it("os períodos de teste cobrem out/2025 até nov/2036 e nov/2026 até nov/2036", () => {
    expect(RANGE[0]).toEqual({ y: 2025, m: 9 });
    expect(RANGE[RANGE.length - 1]).toEqual({ y: 2036, m: 10 });
    expect(RANGE).toHaveLength(134);
    expect(RANGE_HOJE[0]).toEqual({ y: 2026, m: 10 });
    expect(RANGE_HOJE).toHaveLength(121);
  });

  for (const [nome, range] of PERIODOS) {
    it(`saldo de abertura, saldo de cada dia e setas saem idênticos: ${nome}`, { timeout: 120000 }, () => {
      const antigo = montaMeses(metodoAntigo(LANCAMENTOS, SERIES, range), range);
      const novo = montaMeses(metodoNovo(LANCAMENTOS, SERIES, range), range);
      expect(novo).toEqual(antigo);

      // o cenário não pode ser vazio: tem dias, saldo mexendo e setas dos dois tipos
      const dias = novo.flatMap((mes) => mes.days);
      expect(dias.length).toBeGreaterThan(3600);
      expect(dias.some((d) => d.hasIncome)).toBe(true);
      expect(dias.some((d) => d.hasExpense)).toBe(true);
      expect(new Set(dias.map((d) => d.balance)).size).toBeGreaterThan(1000);
    });

    it(`sem nenhuma série (só lançamentos únicos) também fica igual: ${nome}`, () => {
      const antigo = montaMeses(metodoAntigo(LANCAMENTOS, [], range), range);
      const novo = montaMeses(metodoNovo(LANCAMENTOS, [], range), range);
      expect(novo).toEqual(antigo);
    });

    it(`cada série sozinha também fica igual (acha qual série mudou, se algum dia ficar vermelho): ${nome}`, { timeout: 120000 }, () => {
      for (const r of SERIES) {
        const antigo = montaMeses(metodoAntigo([], [r], range), range);
        const novo = montaMeses(metodoNovo([], [r], range), range);
        expect({ serie: r.id, meses: novo }).toEqual({ serie: r.id, meses: antigo });
      }
    });
  }

  it("a lista de cada mês é um pedaço da lista inteira, com a mesma numeração (1/3, 2/3...) e os mesmos valores", { timeout: 120000 }, () => {
    const ultimo = RANGE[RANGE.length - 1]!;
    const fim = isoOf(ultimo.y, ultimo.m, lastDay(ultimo.y, ultimo.m));
    for (const r of SERIES) {
      const todas = occurrencesUntil(r, fim);
      for (const { y, m } of RANGE) {
        const prefixo = `${y}-${String(m + 1).padStart(2, "0")}-`;
        expect({ serie: r.id, mes: prefixo, itens: occurrencesInMonth(r, y, m) }).toEqual({
          serie: r.id,
          mes: prefixo,
          itens: todas.filter((o) => o.date.startsWith(prefixo)),
        });
      }
    }
  });
});
