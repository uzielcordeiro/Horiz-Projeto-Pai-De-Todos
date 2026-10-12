import { cents } from "./money-format";
export type RecurrenceKind = "entradas" | "saidas" | "diarios" | "economias" | "cartao";

/** A daily repetition always needs a finite, positive whole-number count. */
export function dailyRepetitionCount(input: string): number | null {
  if (!/^\d+$/.test(input)) return null;
  const count = Number(input);
  return Number.isSafeInteger(count) && count > 0 ? count : null;
}

/** Includes the initial date, then every seven days within its month. */
export function weeklyRepetitionLimit(startDate: string): number {
  const { y, m, d } = parseIso(startDate);
  return Math.floor((lastDay(y, m) - d) / 7) + 1;
}

export function weeklyRepetitionCount(input: string, startDate: string): number | null {
  const count = dailyRepetitionCount(input);
  return count !== null && count <= weeklyRepetitionLimit(startDate) ? count : null;
}

export type Recurrence = {
  id: string;
  kind: RecurrenceKind;
  name: string;
  label: string;
  tags?: string[];
  amount: number;
  freq: "monthly" | "weekly" | "daily";
  daysOfMonth: number[];
  daysOfWeek: number[];
  startDate: string;
  installments: number | null;
  /** New weekly repetitions stop at the end of their starting month. */
  weeklyWithinStartMonth?: boolean;
  endDate?: string | null;
  skipped: string[];
  /** Economias criadas pelo Horizonte funcionam como transferência do saldo. */
  horizonTransfer?: boolean;
  /** Previsão de gasto diário: total mensal (itens mensais) dividido pelos dias de cada mês. */
  monthlyBudget?: number;
  /** Previsão de gasto diário: soma dos itens semanais (vira valor/7 por dia). */
  weeklyBudget?: number;
  /** Ajustes por dia da previsão: null = valor apagado; número = gasto real do dia. */
  dayEdits?: Record<string, number | null>;
};

export type Occurrence = {
  recurrenceId: string;
  kind: RecurrenceKind;
  date: string;
  amount: number;
  name: string;
  label: string;
  tags: string[];
  index: number;
  total: number | null;
  horizonTransfer?: boolean;
};


const pad = (n: number) => String(n).padStart(2, "0");
export const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

function parseIso(s: string) {
  const parts = s.split("-").map(Number);
  return { y: parts[0] ?? 1970, m: (parts[1] ?? 1) - 1, d: parts[2] ?? 1 };
}

/** Valor por dia de uma previsão: divide pelos dias do mês e arredonda SEMPRE para baixo (centavos). */
export function dailyBudgetAmount(monthly: number, weekly: number, y: number, m: number): number {
  const days = lastDay(y, m);
  const monthlyCents = Math.round(monthly * 100);
  const weeklyCents = Math.round(weekly * 100);
  // em centavos inteiros para não haver erro de arredondamento
  return Math.floor((monthlyCents * 7 + weeklyCents * days) / (days * 7)) / 100;
}

/** Total exato do mês da previsão, em centavos. */
function monthBudgetCents(monthly: number, weekly: number, y: number, m: number): number {
  const days = lastDay(y, m);
  return Math.floor((Math.round(monthly * 100) * 7 + Math.round(weekly * 100) * days) / 7);
}

/** Valor da previsão em um dia: valor por dia, e o último dia recebe os centavos que sobraram para fechar o mês. */
export function dailyBudgetForDay(monthly: number, weekly: number, y: number, m: number, d: number): number {
  const days = lastDay(y, m);
  const rate = Math.round(dailyBudgetAmount(monthly, weekly, y, m) * 100);
  if (d !== days) return rate / 100;
  return (monthBudgetCents(monthly, weekly, y, m) - rate * (days - 1)) / 100;
}

/**
 * Valores de cada dia do mês da previsão, recalculando só para frente.
 * - Apagar dia D: o valor dele sai do total do mês; o que sobra (menos o já gasto antes de D)
 *   é dividido pelos dias de D até o fim do mês (D incluso).
 * - Gasto real X no dia D: o dia fica com X; o que sobra é dividido de D+1 até o fim.
 * Sempre em centavos, arredondando para baixo.
 */
export function forecastMonthAmounts(
  monthly: number,
  weekly: number,
  edits: Record<string, number | null> | undefined,
  y: number,
  m: number,
): number[] {
  const days = lastDay(y, m);
  let rate = Math.round(dailyBudgetAmount(monthly, weekly, y, m) * 100);
  let total = monthBudgetCents(monthly, weekly, y, m);
  let spent = 0;
  const out: number[] = [];
  for (let d = 1; d <= days; d++) {
    const key = isoOf(y, m, d);
    const edit = edits && key in edits ? edits[key] : undefined;
    let value: number;
    if (edit === null) {
      total -= rate;
      rate = Math.max(0, Math.floor((total - spent) / (days - d + 1)));
      value = rate;
    } else if (typeof edit === "number") {
      value = Math.round(edit * 100);
      const left = days - d;
      if (left > 0) rate = Math.max(0, Math.floor((total - spent - value) / left));
    } else value = d === days ? Math.max(0, total - spent) : rate;
    spent += value;
    out.push(value / 100);
  }
  return out;
}

const amountOn = (rec: Recurrence, date: string) => {
  if (rec.monthlyBudget == null && rec.weeklyBudget == null) return rec.amount;
  const { y, m, d } = parseIso(date);
  if (rec.dayEdits && Object.keys(rec.dayEdits).length > 0)
    return forecastMonthAmounts(rec.monthlyBudget ?? 0, rec.weeklyBudget ?? 0, rec.dayEdits, y, m)[d - 1] ?? 0;
  return dailyBudgetForDay(rec.monthlyBudget ?? 0, rec.weeklyBudget ?? 0, y, m, d);
};

/** All occurrences from startDate up to and including untilDate (ISO). */
export function occurrencesUntil(rec: Recurrence, untilDate: string): Occurrence[] {
  const start = parseIso(rec.startDate);
  const out: Occurrence[] = [];
  const total = rec.installments ?? null;
  let index = 0;

  const push = (date: string) => {
    if (date < rec.startDate) return false;
    if (rec.endDate && date > rec.endDate) return true; // encerrada

    index += 1;
    if (total != null && index > total) return true; // stop
    if (date <= untilDate && !rec.skipped.includes(date)) {
      out.push({
        recurrenceId: rec.id,
        kind: rec.kind,
        date,
        amount: amountOn(rec, date),
        name: rec.name,
        label: rec.label,
        tags: rec.tags ?? [],

        index,
        total,
        horizonTransfer: rec.horizonTransfer === true,
      });
    }
    return false;
  };

  // diárias com dias escolhidos: caem exatamente nesses dias, só no mês do lançamento
  if (rec.freq === "daily" && rec.daysOfMonth.length > 0) {
    const days = [...new Set(rec.daysOfMonth)]
      .filter((d) => d >= 1 && d <= lastDay(start.y, start.m))
      .sort((a, b) => a - b);
    days.forEach((day, i) => {
      const date = isoOf(start.y, start.m, day);
      if (rec.endDate && date > rec.endDate) return;
      if (date <= untilDate && !rec.skipped.includes(date)) {
        out.push({
          recurrenceId: rec.id,
          kind: rec.kind,
          date,
          amount: amountOn(rec, date),
          name: rec.name,
          label: rec.label,
          tags: rec.tags ?? [],
          index: i + 1,
          total: days.length,
          horizonTransfer: rec.horizonTransfer === true,
        });
      }
    });
    return out;
  }

  if (rec.freq === "daily") {
    const day = new Date(start.y, start.m, start.d);
    for (;;) {
      const date = isoOf(day.getFullYear(), day.getMonth(), day.getDate());
      if (total == null && date > untilDate) break;
      if (push(date)) return out;
      if (total != null && index >= total) break;
      day.setDate(day.getDate() + 1);
    }
    return out;
  }

  if (rec.freq === "monthly") {
    const days = [...new Set(rec.daysOfMonth)].sort((a, b) => a - b);
    if (days.length === 0) return out;
    let y = start.y;
    let m = start.m;
    for (;;) {
      const first = isoOf(y, m, 1);
      if (total == null && first > untilDate) break;
      for (const day of days) {
        const date = isoOf(y, m, Math.min(day, lastDay(y, m)));
        if (push(date)) return out;
      }
      if (total != null && index >= total) break;
      const next = new Date(y, m + 1, 1);
      y = next.getFullYear();
      m = next.getMonth();
      if (total == null && isoOf(y, m, 1) > untilDate) break;
    }
    return out;
  }

  if (rec.weeklyWithinStartMonth) {
    const count = Math.min(total ?? 0, weeklyRepetitionLimit(rec.startDate));
    for (let i = 0; i < count; i++) {
      if (push(isoOf(start.y, start.m, start.d + i * 7))) break;
    }
    return out;
  }

  const weekdays = [...new Set(rec.daysOfWeek)].sort((a, b) => a - b);
  if (weekdays.length === 0) return out;
  const cursor = new Date(start.y, start.m, start.d);
  cursor.setDate(cursor.getDate() - cursor.getDay()); // start of week (sunday)
  for (;;) {
    const weekStart = isoOf(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    if (total == null && weekStart > untilDate) break;
    for (const wd of weekdays) {
      const d = new Date(cursor);
      d.setDate(d.getDate() + wd);
      if (push(isoOf(d.getFullYear(), d.getMonth(), d.getDate()))) return out;
    }
    if (total != null && index >= total) break;
    cursor.setDate(cursor.getDate() + 7);
  }
  return out;
}

/** Occurrences inside a given month (0-indexed month). */
export function occurrencesInMonth(rec: Recurrence, y: number, m: number): Occurrence[] {
  const end = isoOf(y, m, lastDay(y, m));
  const first = isoOf(y, m, 1);
  return occurrencesUntil(rec, end).filter((o) => o.date >= first);
}

/** Sum of occurrences strictly before a date (used for the opening balance). */
export function sumBefore(rec: Recurrence, date: string): number {
  return occurrencesUntil(rec, date)
    .filter((o) => o.date < date)
    .reduce((s, o) => cents(s + o.amount), 0);
}

export const WEEKDAYS = [
  { value: 0, short: "dom" },
  { value: 1, short: "seg" },
  { value: 2, short: "ter" },
  { value: 3, short: "qua" },
  { value: 4, short: "qui" },
  { value: 5, short: "sex" },
  { value: 6, short: "sáb" },
];

/** Day before a YYYY-MM-DD date, computed from local parts so no timezone shift can occur. */
export function dayBefore(isoDate: string): string {
  const [y = 1970, m = 1, d = 1] = isoDate.split("-").map(Number);
  const t = new Date(y, m - 1, d - 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
