import { cents } from "@/lib/money-format";
import type React from "react";
import { useState } from "react";
import { X } from "lucide-react";
import { FitMoney } from "@/components/FitMoney";
import { CalendarItemLabel } from "@/components/CalendarItemLabel";
import { monthItemLabel } from "@/lib/month-item-label";
type Kind = "entradas" | "saidas" | "diarios" | "economias" | "cartao";

export type TotalsItem = {
  date: string;
  detail: string;
  tags?: string[] | undefined;
  amount: number;
  recurrenceId?: string | undefined;
};

export type TotalsData = {
  totals: Record<Kind, number>;
  diaryDays: number;
  daysInMonth: number;
  forecastPerDay: number;
  savedTotal: number;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const badge: Record<Kind, string> = {
  entradas: "bg-positive text-positive-foreground",
  saidas: "bg-negative text-negative-foreground",
  diarios: "bg-chart-4 text-primary-foreground",
  economias: "bg-primary text-primary-foreground",
  cartao: "bg-chart-1 text-primary-foreground",
};

const LIST: { key: Kind; title: string; letter: string }[] = [
  { key: "entradas", title: "entradas", letter: "E" },
  { key: "saidas", title: "saídas", letter: "S" },
  { key: "diarios", title: "diários", letter: "D" },
  { key: "economias", title: "poupança", letter: "P" },
  { key: "cartao", title: "gastos com cartão", letter: "C" },
];

function Dot({ k }: { k: Kind }) {
  return (
    <span
      aria-hidden
      className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${badge[k]}`}
    >
      {LIST.find((l) => l.key === k)!.letter}
    </span>
  );
}

function Card({
  title,
  formula,
  value,
  hint,
  tone = "text-foreground",
}: {
  title: string;
  formula: React.ReactNode;
  value: React.ReactNode;
  hint: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {formula}
      </div>
      <p className={`mt-4 font-display text-3xl font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-3 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

const valueTone: Record<Kind, string> = {
  entradas: "text-positive",
  saidas: "text-negative",
  diarios: "text-foreground",
  economias: "text-foreground",
  cartao: "text-foreground",
};

export function TotalsBoard({
  data,
  items,
  monthLabel,
}: {
  data: TotalsData;
  items?: Record<Kind, TotalsItem[]>;
  monthLabel?: string;
}) {
  const { totals, diaryDays, daysInMonth, forecastPerDay } = data;
  const [openKind, setOpenKind] = useState<Kind | null>(null);

  const custoVida = cents(totals.saidas + totals.diarios + totals.cartao);
  // performance = saldo final do mês (igual ao resumo do calendário): desconta também a poupança
  const performance = cents(totals.entradas - custoVida - totals.economias);
  const economizado = totals.entradas > 0 ? (totals.economias / totals.entradas) * 100 : 0;
  const diarioMedio = diaryDays > 0 ? totals.diarios / diaryDays : 0;

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <p className="mb-3 text-sm text-muted-foreground">cálculos do mês</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card
            title="performance"
            formula={
              <>
                <Dot k="entradas" />－<Dot k="saidas" />－<Dot k="diarios" />－
                <Dot k="cartao" />－<Dot k="economias" />
              </>
            }
            value=<FitMoney value={performance} />
            hint={performance === 0 ? "zerado" : performance > 0 ? "sobrando" : "no vermelho"}
            tone={
              performance === 0
                ? "text-foreground"
                : performance > 0
                  ? "text-positive"
                  : "text-negative"
            }
          />
          <Card
            title="poupança"
            formula={
              <>
                <Dot k="economias" />
                <span className="h-2 w-24 rounded-full bg-positive/25" />
                <Dot k="entradas" />
              </>
            }
            value=<FitMoney value={totals.economias} />
            hint={`poupando ${Math.round(economizado).toLocaleString("pt-BR")}% do seu salário`}
          />
          <Card
            title="custo de vida"
            formula={
              <>
                <Dot k="saidas" />＋<Dot k="diarios" />＋<Dot k="cartao" />
              </>
            }
            value=<FitMoney value={custoVida} />
            hint={custoVida === 0 ? "zerado" : "somatório dos gastos do mês"}
          />
          <Card
            title="diário médio"
            formula={
              <>
                <Dot k="diarios" />
                <span>/ {diaryDays || 0}</span>
              </>
            }
            value=<FitMoney value={diarioMedio} />
            hint={`diários lançados: ${brl(totals.diarios)}`}
          />
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm text-muted-foreground">movimentações do mês</p>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="divide-y divide-border">
            {LIST.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => setOpenKind(l.key)}
                className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/50"
              >
                <Dot k={l.key} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {l.title}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                  <FitMoney value={totals[l.key]} />
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm text-muted-foreground">previsão de diários do mês</p>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4">
          <Dot k="diarios" />
          <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
            previsão de diário{" "}
            <span className="text-muted-foreground">× {daysInMonth} dias</span>
          </span>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
            <FitMoney value={forecastPerDay} />
          </span>
        </div>
      </div>

      {openKind && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-sm"
          onClick={() => setOpenKind(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={LIST.find((l) => l.key === openKind)!.title}
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-2xl font-bold text-foreground">
                  {LIST.find((l) => l.key === openKind)!.title}
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">{monthLabel ?? ""}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpenKind(null)}
                aria-label="fechar"
                className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {(items?.[openKind] ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                nenhum lançamento neste mês
              </p>
            ) : (
              (() => {
                const list = items?.[openKind] ?? [];
                const first = list[0];
                // diários: quando todos os valores do mês são iguais, mostrar apenas um
                const visible =
                  openKind === "diarios" &&
                  first !== undefined &&
                  list.length > 1 &&
                  list.every((it) => it.amount === first.amount)
                    ? [first]
                    : list;
                return (
                  <div className="space-y-3">
                        {visible.map((it, i) => (
                      <div
                        key={`${it.date}-${i}`}
                        className="rounded-2xl border border-border bg-background p-4"
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          dia {Number(it.date.slice(8, 10))}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <CalendarItemLabel
                            label={monthItemLabel(it.detail, Boolean(it.recurrenceId))}
                            kind={openKind}
                            tags={it.tags}
                          />
                          <span
                            className={`ml-auto shrink-0 text-sm font-semibold tabular-nums ${valueTone[openKind]}`}
                          >
                            <FitMoney value={it.amount} />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}
    </section>
  );
}
