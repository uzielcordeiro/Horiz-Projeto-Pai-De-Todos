import { cents } from "./money-format";

/** Strict 2-decimal rounding for long-range projection sums. */
export const roundMoney = (value: number): number => cents(value);
export type ForecastLike = { amount: number; period: "mensal" | "semanal"; weeks?: number };

const WORDS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
};

/** Lê "3", "3 semanas", "três", "duas semanas" → número de semanas (1–5) ou null. */
export function parseWeeks(input: string): number | null {
  const t = input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!t) return null;
  const num = t.match(/^(\d+)/);
  const n = num ? Number(num[1]) : WORDS[t.split(/\s+/)[0] ?? ""];
  if (!n || n < 1 || n > 5) return null;
  return n;
}

/** Semanal com semanas definidas vira valor × semanas no mês; semanal antigo (sem semanas) segue ÷ 7 por dia. */
export function forecastBudgets(items: ForecastLike[]) {
  let monthly = 0;
  let weekly = 0;
  for (const i of items) {
    if (i.period !== "semanal") monthly = cents(monthly + i.amount);
    else if (i.weeks) monthly = cents(monthly + i.amount * i.weeks);
    else weekly = cents(weekly + i.amount);
  }
  return { monthly, weekly };
}
