import { describe, expect, it } from "vitest";
import { forecastMonthAmounts, occurrencesInMonth, occurrencesUntil, type Recurrence } from "@/lib/recurrence";

/**
 * FISCAL DO CÁLCULO DO DIA/DIA
 *
 * O mês do Dia/Dia com dias editados é calculado uma vez e reaproveitado. Este teste confere
 * que o valor de cada dia continua IGUAL ao cálculo direto, dia por dia (forecastMonthAmounts).
 * Se ficar vermelho, a otimização mudou o valor de algum dia.
 */
const forecast = (edits: Record<string, number | null> | undefined, extra: Partial<Recurrence> = {}): Recurrence => ({
  id: "forecast-auto",
  kind: "diarios",
  name: "Dia/Dia",
  label: "Dia/Dia",
  tags: ["dia a dia"],
  amount: 0,
  monthlyBudget: 3000,
  weeklyBudget: 0,
  freq: "daily",
  daysOfMonth: [],
  daysOfWeek: [],
  startDate: "2026-11-01",
  installments: null,
  skipped: [],
  endDate: null,
  ...(edits ? { dayEdits: edits } : {}),
  ...extra,
});

const DIRETO = (rec: Recurrence, date: string) => {
  const [y = 0, mm = 1, d = 1] = date.split("-").map(Number);
  return forecastMonthAmounts(rec.monthlyBudget ?? 0, rec.weeklyBudget ?? 0, rec.dayEdits, y, mm - 1)[d - 1];
};

const casos: Record<string, Record<string, number | null> | undefined> = {
  "sem edições": undefined,
  "objeto vazio": {},
  "um dia apagado": { "2026-11-06": null },
  "um dia com gasto real": { "2026-11-10": 50 },
  "apagado e editado no mesmo mês": { "2026-11-06": null, "2026-11-10": 50, "2026-11-30": 0 },
  "edições em meses diferentes": { "2026-11-06": null, "2026-12-15": 80, "2027-02-28": null },
};

describe("Dia/Dia: valor de cada dia igual ao cálculo direto", () => {
  for (const [nome, edits] of Object.entries(casos)) {
    it(nome, () => {
      const rec = forecast(edits);
      const todas = occurrencesUntil(rec, "2027-03-31");
      expect(todas.length).toBeGreaterThan(100);
      if (edits && Object.keys(edits).length > 0) {
        for (const o of todas) expect(o.amount).toBe(DIRETO(rec, o.date));
      }
      // o mês isolado dá os mesmos valores do trecho correspondente
      const dezembro = occurrencesInMonth(rec, 2026, 11);
      expect(dezembro).toHaveLength(31);
      expect(dezembro.map((o) => o.amount)).toEqual(todas.filter((o) => o.date.startsWith("2026-12")).map((o) => o.amount));
    });
  }

  it("com semanal e orçamento diferente também fica igual", () => {
    const rec = forecast({ "2026-11-06": null, "2027-01-03": 20 }, { monthlyBudget: 1234.56, weeklyBudget: 70 });
    for (const o of occurrencesUntil(rec, "2027-03-31")) expect(o.amount).toBe(DIRETO(rec, o.date));
  });

  it("dia pulado (skipped) continua fora e os outros mantêm o valor", () => {
    const rec = forecast({ "2026-11-06": null }, { skipped: ["2026-11-08"] });
    const todas = occurrencesUntil(rec, "2026-11-30");
    expect(todas.some((o) => o.date === "2026-11-08")).toBe(false);
    for (const o of todas) expect(o.amount).toBe(DIRETO(rec, o.date));
  });
});
