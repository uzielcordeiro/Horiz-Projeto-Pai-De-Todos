import { FitMoney } from "@/components/FitMoney";
import { Button } from "@/components/ui/button";
import { memo, useEffect, useRef, useState } from "react";

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
  positive: "bg-horizon-positive-cell text-positive",
  warning: "bg-horizon-warning-cell text-horizon-warning-text",
  negative: "bg-horizon-negative-cell text-negative",
  negativeDeep: "bg-horizon-debt-cell text-negative-deep-text",
};

/** mesmas cores dos dias do quadro, na ordem vermelho → amarelo → verde-claro → verde-escuro */
const legend: { label: string; dotClass: string }[] = [
  { label: "negativo", dotClass: "bg-horizon-negative-cell" },
  { label: "R$ 1.000 negativo ou mais", dotClass: "bg-horizon-debt-cell" },
  { label: "entre R$ 0 e R$ 1.000", dotClass: "bg-horizon-warning-cell" },
  { label: "R$ 1.000 até R$ 2.000", dotClass: "bg-horizon-positive-cell" },
  { label: "acima de R$ 2.000", dotClass: "bg-surplus" },
];

type Props = {
  months: HorizonMonth[];
  onShift: (delta: number) => void;
  onToday: () => void;
  onPick: (y: number, m: number, day: number) => void;
  todayIso: string;
  highlightDate?: string | null;
};

type ColumnProps = {
  mo: HorizonMonth;
  maxDays: number;
  todayIso: string;
  highlightDate?: string | null | undefined;
  onPick: (y: number, m: number, day: number) => void;
  /** Última coluna não desenha o tracinho vertical na borda externa. */
  last?: boolean;
};

/** Tracinho vertical curto entre colunas: não encosta na linha de cima nem na de baixo. */
function ColumnTick() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute right-0 top-1/2 h-[18px] w-px -translate-y-1/2 bg-border/70"
    />
  );
}

/** Coluna de um mês: marcadores calculados uma vez por mês, não por célula. */
const MonthColumn = memo(function MonthColumn({ mo, maxDays, todayIso, highlightDate, onPick, last }: ColumnProps) {
  const lowest = mo.days.reduce<HorizonDay | undefined>((best, day) =>
    !best || day.balance < best.balance || (day.balance === best.balance && day.day < best.day) ? day : best,
  undefined);
  const highest = mo.days.reduce<HorizonDay | undefined>((best, day) =>
    !best || day.balance > best.balance || (day.balance === best.balance && day.day < best.day) ? day : best,
  undefined);

  return (
    <div className="w-40 shrink-0">
      <button
        type="button"
        onClick={() => onPick(mo.y, mo.m, 1)}
        className="sticky top-0 z-10 relative block w-full border-b border-border bg-secondary px-3 py-2.5 text-center text-sm font-semibold text-foreground transition-colors hover:bg-accent"
      >
        {mo.label}
        {!last && <ColumnTick />}
      </button>
      <div className="divide-y divide-border">
        {Array.from({ length: maxDays }, (_, i) => {
          const d = mo.days[i];
          if (!d)
            return (
              <div key={i} className="relative h-8 bg-muted/20" aria-hidden>
                {!last && <ColumnTick />}
              </div>
            );
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
              className={`relative grid h-8 w-full grid-cols-[34px_minmax(0,1fr)] items-center text-xs transition-opacity hover:opacity-80 ${cell[d.status]} ${
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
              {!last && <ColumnTick />}
            </button>
          );
        })}
      </div>
    </div>
  );
});

/** Largura fixa de cada coluna (w-40) — base para desenhar só as colunas visíveis. */
const COLUMN_WIDTH = 160;
/** Colunas extras desenhadas além da área visível, para a rolagem não mostrar buracos. */
const OVERSCAN = 3;
/** Colunas desenhadas no primeiro quadro, antes de medir a tela (cobre telas largas). */
const INITIAL_COLUMNS = 12;

export function HorizonBoard({ months, onShift, onToday, onPick, todayIso, highlightDate }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ from: 0, to: INITIAL_COLUMNS });
  const nav =
    "grid size-9 shrink-0 place-items-center rounded-full border-2 border-foreground text-foreground transition-colors hover:bg-accent";
  /** verde-escuro enquanto aperta a seta de mês, vermelho enquanto aperta a seta de ano */
  const navMonth = `${nav} active:bg-surplus`;
  const navYear = `${nav} active:bg-negative`;
  const maxDays = Math.max(...months.map((mo) => mo.days.length), 31);

  // Trava universal de eixos para macOS (trackpad/magic mouse) e Windows
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);

      // Se houver movimento combinado (diagonal gerada por trackpad ou mouse)
      if (absX > 0 && absY > 0) {
        e.preventDefault();
        // Define estritamente o eixo principal e força o scroll apenas nele
        if (absX >= absY) {
          el.scrollLeft += e.deltaX;
        } else {
          el.scrollTop += e.deltaY;
        }
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
    };
  }, []);

  // Desenha apenas as colunas na área visível (mais uma folga).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth || INITIAL_COLUMNS * COLUMN_WIDTH;
      const from = Math.max(0, Math.floor(el.scrollLeft / COLUMN_WIDTH) - OVERSCAN);
      const to = Math.ceil((el.scrollLeft + width) / COLUMN_WIDTH) + OVERSCAN;
      setRange((r) => (r.from === from && r.to === to ? r : { from, to }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, [months.length]);

  const from = Math.min(range.from, months.length);
  const to = Math.min(range.to, months.length);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {legend.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5 whitespace-nowrap">
              <span aria-hidden className={`size-3 shrink-0 rounded-full ${item.dotClass}`} />
              <span className="truncate">{item.label}</span>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
          <Button
            variant="ghost"
            onClick={() => {
              const scroller = scrollerRef.current;
              if (scroller) {
                scroller.scrollLeft = 0;
                scroller.scrollTop = 0;
              }
              setRange({ from: 0, to: INITIAL_COLUMNS });
              onToday();
            }}
            className="mr-2 h-9 rounded-full border-[1.5px] border-foreground/30 bg-accent/60 px-3 text-xs font-bold text-foreground transition-colors hover:bg-accent sm:mr-3"
          >
            hoje
          </Button>
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
          style={{ touchAction: "pan-x pan-y" }}
        >
          <div className="flex min-w-max">
            {from > 0 && <div aria-hidden className="shrink-0" style={{ width: from * COLUMN_WIDTH }} />}
            {months.slice(from, to).map((mo, i) => (
              <MonthColumn
                key={`${mo.y}-${mo.m}`}
                mo={mo}
                maxDays={maxDays}
                todayIso={todayIso}
                highlightDate={highlightDate}
                onPick={onPick}
                last={from + i === months.length - 1}
              />
            ))}
            {to < months.length && (
              <div aria-hidden className="shrink-0" style={{ width: (months.length - to) * COLUMN_WIDTH }} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
