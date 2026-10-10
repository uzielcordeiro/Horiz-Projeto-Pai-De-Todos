import { FitMoney } from "@/components/FitMoney";
import { useRef } from "react";

type Status = "surplus" | "positive" | "warning" | "negative" | "negativeDeep";

export type HorizonDay = {
  day: number;
  date: string;
  balance: number;
  status: Status;
};

export type HorizonMonth = {
  y: number;
  m: number;
  label: string;
  days: HorizonDay[];
};

const cell: Record<Status, string> = {
  surplus: "bg-surplus text-surplus-foreground",
  positive: "bg-positive/20 text-positive",
  warning: "bg-warning/25 text-warning-foreground",
  negative: "bg-negative/20 text-negative",
  negativeDeep: "bg-negative-deep/45 text-negative-deep-text",
};


/** mesmas cores dos dias do quadro, na ordem vermelho → amarelo → verde-claro → verde-escuro */
const legend: { label: string; dotClass: string }[] = [
  { label: "negativo", dotClass: "bg-negative/20" },
  { label: "R$ 1.000 negativo ou mais", dotClass: "bg-negative-deep/45" },
  { label: "entre R$ 0 e R$ 1.000", dotClass: "bg-warning/25" },
  { label: "R$ 1.000 até R$ 2.000", dotClass: "bg-positive/20" },
  { label: "acima de R$ 2.000", dotClass: "bg-surplus" },
];



type Props = {
  months: HorizonMonth[];
  onShift: (delta: number) => void;
  onPick: (y: number, m: number, day: number) => void;
  todayIso: string;
  highlightDate?: string | null;
};

export function HorizonBoard({ months, onShift, onPick, todayIso, highlightDate }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const nav =
    "grid size-9 shrink-0 place-items-center rounded-full border-2 border-foreground text-foreground transition-colors hover:bg-accent";
  /** verde-escuro enquanto aperta a seta de mês, vermelho enquanto aperta a seta de ano */
  const navMonth = `${nav} active:bg-surplus`;
  const navYear = `${nav} active:bg-negative`;
  const maxDays = Math.max(...months.map((mo) => mo.days.length), 31);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between gap-3">
        <ul className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {legend.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5 whitespace-nowrap">
              <span aria-hidden className={`size-3 shrink-0 rounded-full ${item.dotClass}`} />
              <span className="truncate">{item.label}</span>
            </li>
          ))}
        </ul>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={() => onShift(-12)} aria-label="12 meses antes" className={navYear}>
            «
          </button>
          <button onClick={() => onShift(-1)} aria-label="mês anterior" className={navMonth}>
            ‹
          </button>
          <button onClick={() => onShift(1)} aria-label="próximo mês" className={navMonth}>
            ›
          </button>
          <button onClick={() => onShift(12)} aria-label="12 meses depois" className={navYear}>
            »
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border">
        <div
          ref={scrollerRef}
          className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-2xl"
        >
          <div className="flex min-w-max">
            {months.map((mo) => (
              <div key={`${mo.y}-${mo.m}`} className="w-40 shrink-0 border-r border-border last:border-r-0">
                <button
                  type="button"
                  onClick={() => onPick(mo.y, mo.m, 1)}
                  className="sticky top-0 z-10 block w-full border-b border-border bg-secondary px-3 py-2.5 text-center text-sm font-semibold text-foreground transition-colors hover:bg-accent"
                >
                  {mo.label}
                </button>
                <div className="divide-y divide-border">

                  {Array.from({ length: maxDays }, (_, i) => {
                    const d = mo.days[i];
                    if (!d)
                      return <div key={i} className="h-8 bg-muted/20" aria-hidden />;
                    const lowest = mo.days.reduce<HorizonDay | undefined>((best, day) =>
                      !best || day.balance < best.balance || (day.balance === best.balance && day.day < best.day) ? day : best,
                    undefined);
                    const highest = mo.days.reduce<HorizonDay | undefined>((best, day) =>
                      !best || day.balance > best.balance || (day.balance === best.balance && day.day < best.day) ? day : best,
                    undefined);
                    const reminder = d.date === lowest?.date && d.balance <= -1000
                      ? "negative"
                      : d.date === highest?.date && d.balance > 2000 ? "positive" : undefined;
                    const isToday = d.date === todayIso;
                    return (
                      <button
                        key={d.date}
                        type="button"
                        data-horizon-day={d.date}
                        data-horizon-highlighted={d.date === highlightDate ? "true" : undefined}
                        onClick={() => onPick(mo.y, mo.m, d.day)}
                        className={`grid h-8 w-full grid-cols-[34px_minmax(0,1fr)] items-center text-xs transition-opacity hover:opacity-80 ${cell[d.status]} ${
                          isToday ? "border-b-2 border-foreground" : ""
                        } ${d.date === highlightDate ? "horizon-cut-marker" : ""}`}
                      >
                        <span
                          className={`h-full grid place-items-center bg-background/60 tabular-nums ${
                            isToday ? "font-bold text-foreground" : "text-muted-foreground"
                          } ${d.date === highlightDate ? "font-bold text-foreground" : ""}`}
                        >
                          {d.day}
                        </span>
                        <span className={`grid min-w-0 grid-cols-[16px_minmax(0,1fr)] items-center gap-1 px-1.5 text-right tabular-nums ${d.status === "negativeDeep" ? "font-bold" : "font-semibold"}`}>
                          <span className="grid size-4 place-items-center">
                            {reminder && (
                              <span
                                role="img"
                                aria-label={reminder === "negative" ? "Menor saldo do mês" : "Maior saldo do mês"}
                                title={reminder === "negative" ? "Menor saldo do mês" : "Maior saldo do mês"}
                                className={`horizon-reminder horizon-reminder-${reminder}`}
                              />
                            )}
                          </span>
                          <span data-fit className="min-w-0"><FitMoney value={d.balance} symbol={false} /></span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </section>
  );
}
