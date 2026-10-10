import { FitMoney } from "@/components/FitMoney";
import { MoneyInput } from "@/components/MoneyInput";
import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { AddWindow } from "@/components/AddWindow";
import { MonthCalendar } from "@/components/MonthCalendar";
import { HorizonBoard, type HorizonDay, type HorizonMonth } from "@/components/HorizonBoard";
import { TotalsBoard } from "@/components/TotalsBoard";
import { TagsBoard, type TagRow } from "@/components/TagsBoard";
import { SectionBadge, SECTION_KINDS, type SectionKind } from "@/components/SectionBadge";
import { forecastBudgets } from "@/lib/forecast";
import { cents } from "@/lib/money-format";
import { monthItemLabel } from "@/lib/month-item-label";
import { CalendarItemLabel } from "@/components/CalendarItemLabel";

import { DailyForecastBoard, type ForecastItem } from "@/components/DailyForecastBoard";

import {
  dailyBudgetAmount,
  dailyRepetitionCount,
  weeklyRepetitionCount,
  weeklyRepetitionLimit,
  occurrencesInMonth,
  occurrencesUntil,
  sumBefore,
  type Occurrence,
  type Recurrence,
} from "@/lib/recurrence";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Saldos — Linha do Tempo Financeira" },
      {
        name: "description",
        content:
          "Agenda financeira dia a dia: entradas, saídas parceladas ou recorrentes, diários, poupança, cartão e saldo acumulado.",
      },
      { property: "og:title", content: "Saldos — Linha do Tempo Financeira" },
      {
        property: "og:description",
        content:
          "Agenda financeira dia a dia: entradas, saídas parceladas ou recorrentes, diários, poupança, cartão e saldo acumulado.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  ssr: false,
  pendingComponent: LoadingScreen,
  component: Index,
});

function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
      carregando…
    </div>
  );
}

type Kind = "entradas" | "saidas" | "diarios" | "economias" | "cartao";

type Entry = {
  id: string;
  amount: number;
  date: string;
  label: string;
  kind: Kind;
  tags?: string[];
  /** Economias criadas pelo Horizonte funcionam como transferência do saldo. */
  horizonTransfer?: boolean;
};


const STORAGE_KEY = "timeline-entries-v1";
const REC_KEY = "timeline-recurrences-v1";
const FORECAST_KEY = "timeline-forecast-v1";
const FORECAST_DIVISOR_KEY = "timeline-forecast-divisor-v1";
const TAGS_KEY = "timeline-tags-v1";
const BACKUP_SUFFIX = "-backup";
const FORECAST_ID = "forecast-auto";

const KINDS: { key: Kind; title: string; sign: 1 | -1 | 0 }[] = [
  { key: "entradas", title: "entradas", sign: 1 },
  { key: "saidas", title: "saídas", sign: -1 },
  { key: "diarios", title: "diários", sign: -1 },
  // economias é independente: não entra no saldo (sign 0)
  { key: "economias", title: "poupança", sign: 0 },
  { key: "cartao", title: "cartão", sign: -1 },
];

const SUGGESTIONS: Record<Kind, string[]> = {
  entradas: ["Salário", "Freela", "Diária", "Trabalho extra", "Outro"],
  saidas: ["Aluguel", "Água", "Luz", "Internet", "Mercado", "Combustível", "Outro"],
  diarios: ["Alimentação", "Transporte", "Lazer", "Outro"],
  economias: ["Poupança", "Reserva", "Investimento", "Meta"],
  cartao: ["Fatura", "Parcela", "Compra", "Outro"],
};

const TAG_SUGGESTIONS = [
  "fixo",
  "variável",
  "extra",
  "serviço extra",
  "casa",
  "carro",
  "saúde",
  "lazer",
  "investimento",
];


const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const monthLabel = (y: number, m: number) =>
  new Date(y, m, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

/** Data por extenso, com "1º" no primeiro dia do mês. */
const longDate = (isoDate: string) =>
  new Date(isoDate + "T12:00:00")
    .toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })
    .replace(/^1\s/, "1º ");

type Status = "positive" | "warning" | "negative";
const statusOf = (b: number): Status => (b >= 1000 ? "positive" : b >= 0 ? "warning" : "negative");
/** no Horizonte, R$ 1.000 negativo ou mais ganha o vermelho mais intenso (--negative-deep) */
const horizonStatusOf = (b: number): HorizonDay["status"] =>
  b <= -1000 ? "negativeDeep" : b >= 2000 ? "surplus" : statusOf(b);

const saldoCell: Record<Status, string> = {
  positive: "bg-positive/15 text-positive",
  warning: "bg-warning/20 text-warning-foreground",
  negative: "bg-negative/15 text-negative",
};
const dotClass: Record<Status, string> = {
  positive: "bg-positive",
  warning: "bg-warning",
  negative: "bg-negative",
};

const kindTone: Record<Kind, string> = {
  entradas: "text-positive",
  saidas: "text-negative",
  diarios: "text-negative",
  economias: "text-foreground",
  cartao: "text-negative",
};

function parseAmount(input: string) {
  const n = Number(input.replace(/\s|R\$/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}


const balanceSign = (kind: Kind, horizonTransfer?: boolean): 1 | -1 | 0 => {
  if (kind === "economias" && horizonTransfer) return -1;
  return KINDS.find((item) => item.key === kind)?.sign ?? 0;
};

const signedTotal = (list: Entry[]) =>
  list.reduce((sum, e) => {
    const sign = balanceSign(e.kind, e.horizonTransfer);
    return cents(sum + sign * e.amount);
  }, 0);

const GRID = "grid-cols-[56px_repeat(6,minmax(110px,1fr))]";

type DayItem = {
  key: string;
  kind: Kind;
  title: string;
  sign: 1 | -1 | 0;
  amount: number;
  detail: string;
  tags?: string[];
  entryId?: string;
  recurrenceId?: string;
  date: string;
  horizonTransfer?: boolean;
};

type Freq = "unico" | "diario" | "mensal" | "semanal";

function Index() {
  const today = new Date();
  const tableRef = useRef<HTMLElement>(null);
  const tableHeaderRef = useRef<HTMLDivElement>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [recurrences, setRecurrences] = useState<Recurrence[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [windowMode, setWindowMode] = useState<"add" | "month" | "list" | "detail" | "edit" | "info">("add");
  const [activeItemKey, setActiveItemKey] = useState<string | null>(null);
  const [forecastSpent, setForecastSpent] = useState("");
  const [forecastConfirm, setForecastConfirm] = useState(false);
  const [forecastRestoring, setForecastRestoring] = useState(false);
  const [forecastShake, setForecastShake] = useState(0);
  const [view, setView] = useState<"saldos" | "horizonte" | "totais" | "tags" | "menu" | "diario">("saldos");
  const [horizonStart, setHorizonStart] = useState({ y: today.getFullYear(), m: today.getMonth() });

  // previsão gasto diário (menu)
  const [forecastItems, setForecastItems] = useState<ForecastItem[]>([]);
  const [forecastDivisor, setForecastDivisor] = useState(30);

  // mapa de tags: independente dos lançamentos (renomear/apagar não mexe em valores)
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [deletedTags, setDeletedTags] = useState<string[]>([]);

  const [kind, setKind] = useState<Kind>("entradas");
  const [windowKind, setWindowKind] = useState<Kind | "saldos">("entradas");
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  // data livre do lançamento (passado ou futuro, qualquer ano)
  const [formDate, setFormDate] = useState(() =>
    iso(today.getFullYear(), today.getMonth(), today.getDate()),
  );

  // etiquetas
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [showCal, setShowCal] = useState(false);

  // repetição / parcelas (disponível em todas as categorias)
  const [debtName, setDebtName] = useState("");
  const [freq, setFreq] = useState<Freq>("unico");
  const [infinite, setInfinite] = useState(false);
  const [installments, setInstallments] = useState("");
  const installmentsRef = useRef<HTMLInputElement>(null);
  const [daysOfMonth, setDaysOfMonth] = useState<number[]>([]);


  // histórico (desfazer) e seleção múltipla
  const [history, setHistory] = useState<{ entries: Entry[]; recurrences: Recurrence[] }[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  // edição completa de um lançamento já existente (mantém tudo, muda só o que você alterar)
  const [editTarget, setEditTarget] = useState<{ type: "entry" | "rec"; id: string } | null>(null);
  const [formOrigin, setFormOrigin] = useState<"standard" | "horizon">("standard");
  // janela de ajuste no Horizonte — só abre quando se vem da origem de Economias no calendário
  const [horizonJump, setHorizonJump] = useState<{
    item: DayItem;
    amount: string;
    ask: null | "save" | "undo";
    error: string | null;
  } | null>(null);
  const [horizonHighlight, setHorizonHighlight] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, DayItem>>({});
  const [confirmAll, setConfirmAll] = useState<"mes" | "ano" | "tudo" | null>(null);

  function commit(nextEntries: Entry[], nextRecurrences: Recurrence[]) {
    setHistory((h) => [...h.slice(-19), { entries, recurrences }]);
    setEntries(nextEntries);
    setRecurrences(nextRecurrences);
  }

  function undo() {
    setHistory((h) => {
      const last = h[h.length - 1];
      if (!last) return h;
      setEntries(last.entries);
      setRecurrences(last.recurrences);
      setSelected({});
      return h.slice(0, -1);
    });
  }


  useLayoutEffect(() => {
    // Lê cada parte separadamente; se a principal falhar, tenta a cópia de segurança.
    // Nunca deixa um defeito numa parte apagar as outras.
    function readKey<T>(key: string, parse: (raw: string) => T): T | undefined {
      for (const k of [key, key + BACKUP_SUFFIX]) {
        try {
          const raw = localStorage.getItem(k);
          if (raw == null) continue;
          return parse(raw);
        } catch {
          try {
            const raw = localStorage.getItem(k);
            if (raw != null) localStorage.setItem(k + "-corrompido-" + Date.now(), raw);
          } catch {
            /* ignore */
          }
        }
      }
      return undefined;
    }
    const e = readKey(STORAGE_KEY, (raw) => {
      const p = JSON.parse(raw) as Entry[];
      if (!Array.isArray(p)) throw new Error("bad");
      return p.map((x) => ({ ...x, kind: x.kind ?? "entradas" }));
    });
    if (e) setEntries(e);
    const r = readKey(REC_KEY, (raw) => {
      const p = JSON.parse(raw) as Recurrence[];
      if (!Array.isArray(p)) throw new Error("bad");
      return p.map((x) => ({ ...x, skipped: x.skipped ?? [] }));
    });
    if (r) setRecurrences(r);
    const f = readKey(FORECAST_KEY, (raw) => {
      const p = JSON.parse(raw) as ForecastItem[];
      if (!Array.isArray(p)) throw new Error("bad");
      return p;
    });
    if (f) setForecastItems(f);
    const d = readKey(FORECAST_DIVISOR_KEY, (raw) => {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) throw new Error("bad");
      return n;
    });
    if (d) setForecastDivisor(d);
    const t = readKey(TAGS_KEY, (raw) => JSON.parse(raw) as { custom?: string[]; deleted?: string[] });
    if (t) {
      setCustomTags(t.custom ?? []);
      setDeletedTags(t.deleted ?? []);
    }
    try {
      void navigator.storage?.persist?.();
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const write = (key: string, value: string) => {
      try {
        localStorage.setItem(key, value);
        localStorage.setItem(key + BACKUP_SUFFIX, value);
      } catch {
        /* ignore */
      }
    };
    write(STORAGE_KEY, JSON.stringify(entries));
    write(REC_KEY, JSON.stringify(recurrences));
    write(FORECAST_KEY, JSON.stringify(forecastItems));
    write(FORECAST_DIVISOR_KEY, String(forecastDivisor));
    write(TAGS_KEY, JSON.stringify({ custom: customTags, deleted: deletedTags }));
  }, [entries, recurrences, forecastItems, forecastDivisor, customTags, deletedTags, loaded]);

  // sincroniza a previsão gasto diário como saída diária automática no calendário
  useEffect(() => {
    if (!loaded) return;
    const { monthly: monthlyBudget, weekly: weeklyBudget } = forecastBudgets(forecastItems);
    const perDay = forecastItems.length > 0 ? monthlyBudget + weeklyBudget : 0;

    setRecurrences((prev) => {
      const existing = prev.find((r) => r.id === FORECAST_ID);
      if (perDay > 0) {
        if (!existing) {
          const first = iso(today.getFullYear(), today.getMonth(), 1);
          return [
            ...prev,
            {
              id: FORECAST_ID,
              kind: "diarios",
              name: "previsão gasto diário",
              label: "gasto diário",
              tags: ["previsão"],
              amount: 0,
              monthlyBudget,
              weeklyBudget,
              freq: "daily",
              daysOfMonth: [],
              daysOfWeek: [],
              startDate: first,
              installments: null,
              endDate: null,
              skipped: [],
            } satisfies Recurrence,
          ];
        }
        if (
          existing.monthlyBudget === monthlyBudget &&
          existing.weeklyBudget === weeklyBudget &&
          existing.kind === "diarios"
        )
          return prev;
        return prev.map((r) =>
          r.id === FORECAST_ID ? { ...r, monthlyBudget, weeklyBudget, kind: "diarios" } : r,
        );
      }
      return existing ? prev.filter((r) => r.id !== FORECAST_ID) : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecastItems, loaded]);

  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();

  const rows = useMemo(() => {
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const openingDate = iso(cursor.y, cursor.m, 1);
    const opening =
      signedTotal(sorted.filter((e) => e.date < openingDate)) +
      recurrences.reduce((s, r) => {
        const sign = balanceSign(r.kind as Kind, r.horizonTransfer);
        return cents(s + sign * sumBefore(r, openingDate));
      }, 0);

    const byDate = new Map<string, Occurrence[]>();
    for (const r of recurrences) {
      for (const o of occurrencesInMonth(r, cursor.y, cursor.m)) {
        const list = byDate.get(o.date) ?? [];
        list.push(o);
        byDate.set(o.date, list);
      }
    }

    let running = opening;

    const list = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const date = iso(cursor.y, cursor.m, day);
      const dayEntries = sorted.filter((e) => e.date === date);
      const dayOccurrences = byDate.get(date) ?? [];

      const items: DayItem[] = [
        ...dayEntries.map((e) => {
          const k = KINDS.find((x) => x.key === e.kind)!;
          return {
            key: e.id,
            kind: e.kind,
            title: k.title,
            sign: balanceSign(e.kind, e.horizonTransfer),
            amount: e.amount,
            detail: e.label,
            tags: e.tags ?? [],
            entryId: e.id,
            date,
            horizonTransfer: e.horizonTransfer === true,
          } satisfies DayItem;
        }),
        ...dayOccurrences.map((o) => {
          const k = KINDS.find((x) => x.key === o.kind) ?? KINDS[1]!;
          return {
            key: `${o.recurrenceId}-${o.date}`,
            kind: k.key,
            title: k.title,
            sign: balanceSign(k.key, o.horizonTransfer),
            amount: o.amount,
            detail: `${o.name || o.label}${
              o.total ? ` · ${o.index}/${o.total}` : " · recorrente"
            }`,
            recurrenceId: o.recurrenceId,
            tags: o.tags,
            date: o.date,
            horizonTransfer: o.horizonTransfer === true,
          } satisfies DayItem;
        }),

      ];

      const totals = {} as Record<Kind, number>;
      for (const k of KINDS) {
        totals[k.key] = items
          .filter((it) => it.kind === k.key)
          .reduce((s, it) => cents(s + it.amount), 0);
      }
      running = cents(running + items.reduce((s, it) => cents(s + it.sign * it.amount), 0));
      return { day, date, totals, balance: running, items };
    });

    return { list, opening, closing: running };
  }, [entries, recurrences, cursor, daysInMonth]);

  const monthTotals = useMemo(() => {
    const t = {} as Record<Kind, number>;
    for (const k of KINDS) t[k.key] = rows.list.reduce((s, r) => cents(s + r.totals[k.key]), 0);
    return t;
  }, [rows]);

  /** Dados da aba totais: previsão do Menu por dia, para o mês selecionado. */
  const totalsData = useMemo(() => {
    const diaryDays = rows.list.filter((r) => r.totals.diarios > 0).length;
    const { monthly: monthlyBudget, weekly: weeklyBudget } = forecastBudgets(forecastItems);
    const forecastPerDay = dailyBudgetAmount(monthlyBudget, weeklyBudget, cursor.y, cursor.m);
    const nextMonth = iso(cursor.y, cursor.m + 1, 1);
    const savedTotal =
      entries
        .filter((entry) => entry.kind === "economias" && entry.date < nextMonth)
        .reduce((sum, entry) => cents(sum + entry.amount), 0) +
      recurrences
        .filter((recurrence) => recurrence.kind === "economias")
        .reduce((sum, recurrence) => cents(sum + sumBefore(recurrence, nextMonth)), 0);
    return { totals: monthTotals, diaryDays, daysInMonth, forecastPerDay, savedTotal };
  }, [rows, monthTotals, cursor, daysInMonth, entries, recurrences, forecastItems]);

  /** todas as tags em uso, de todos os lançamentos e repetições (espelho do calendário) */
  const tagRows = useMemo<TagRow[]>(() => {
    const map = new Map<string, { total: number; count: number; kinds: Set<SectionKind> }>();
    const push = (tags: string[] | undefined, amount: number, kind: SectionKind) => {
      for (const t of new Set(tags ?? [])) {
        const cur = map.get(t) ?? { total: 0, count: 0, kinds: new Set<SectionKind>() };
        cur.kinds.add(kind);
        map.set(t, { total: cents(cur.total + amount), count: cur.count + 1, kinds: cur.kinds });
      }
    };
    for (const e of entries) push(e.tags, e.amount, e.kind);
    // repetição: uma tag vale para todas as parcelas; sem fim conta até o mês aberto
    const untilEnd = iso(cursor.y, cursor.m, new Date(cursor.y, cursor.m + 1, 0).getDate());
    for (const r of recurrences) {
      if (!r.tags?.length) continue;
      const until = r.installments != null ? "9999-12-31" : untilEnd;
      for (const o of occurrencesUntil(r, until)) push(r.tags, o.amount, r.kind);
    }
    return Array.from(map, ([tag, v]) => ({ tag, total: v.total, count: v.count, kinds: SECTION_KINDS.filter((kind) => v.kinds.has(kind)) }));
  }, [entries, recurrences, cursor]);

  /** Renomeia uma tag em todos os lançamentos (valores não mudam). */
  function renameTag(oldTag: string, newTag: string) {
    const swap = (list: string[]) => {
      const out: string[] = [];
      for (const t of list) {
        const n = t === oldTag ? newTag : t;
        if (!out.includes(n)) out.push(n);
      }
      return out;
    };
    const apply = <T extends { tags?: string[] }>(x: T): T =>
      x.tags?.includes(oldTag) ? { ...x, tags: swap(x.tags) } : x;
    setEntries((prev) => prev.map(apply));
    setRecurrences((prev) => prev.map(apply));
    setTags((prev) => swap(prev));
  }

  /** Apaga uma tag de todos os lançamentos (valores não mudam). */
  function deleteTag(tag: string) {
    const strip = <T extends { tags?: string[] }>(x: T): T =>
      x.tags?.includes(tag) ? { ...x, tags: x.tags.filter((t) => t !== tag) } : x;
    setEntries((prev) => prev.map(strip));
    setRecurrences((prev) => prev.map(strip));
    setTags((prev) => prev.filter((t) => t !== tag));
  }


  const horizonMonths = useMemo<HorizonMonth[]>(() => {
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const out: HorizonMonth[] = [];
    for (let i = 0; i < 12; i += 1) {
      const ref = new Date(horizonStart.y, horizonStart.m + i, 1);
      const y = ref.getFullYear();
      const m = ref.getMonth();
      const first = iso(y, m, 1);
      const total = new Date(y, m + 1, 0).getDate();

      // saldo de abertura do mês
      let running =
        sorted
          .filter((e) => e.date < first)
          .reduce(
            (sum, e) => cents(sum + balanceSign(e.kind, e.horizonTransfer) * e.amount),
            0,
          ) +
        recurrences.reduce((s, r) => {
          const k = KINDS.find((x) => x.key === r.kind);
          if (!k) return s;
          return cents(s + balanceSign(r.kind as Kind, r.horizonTransfer) * sumBefore(r, first));
        }, 0);

      const byDate = new Map<string, number>();
      for (const e of sorted) {
        if (e.date >= first) {
          const k = KINDS.find((x) => x.key === e.kind);
          if (k) {
            byDate.set(
              e.date,
              cents((byDate.get(e.date) ?? 0) + balanceSign(e.kind, e.horizonTransfer) * e.amount),
            );
          }
        }
      }
      for (const r of recurrences) {
        for (const o of occurrencesInMonth(r, y, m)) {
          const k = KINDS.find((x) => x.key === o.kind);
          if (k) {
            byDate.set(
              o.date,
              cents((byDate.get(o.date) ?? 0) +
                balanceSign(o.kind as Kind, o.horizonTransfer) * o.amount),
            );
          }
        }
      }

      const days = Array.from({ length: total }, (_, idx) => {
        const day = idx + 1;
        const date = iso(y, m, day);
        running = cents(running + (byDate.get(date) ?? 0));
        return { day, date, balance: running, status: horizonStatusOf(running) };
      });

      const label = `${new Date(y, m, 1)
        .toLocaleDateString("pt-BR", { month: "short" })
        .replace(".", "")
        .slice(0, 3)}/${String(y).slice(-2)}`;

      out.push({ y, m, label, days });
    }
    return out;
  }, [entries, recurrences, horizonStart]);


  const closingStatus = statusOf(rows.closing);

  function shiftMonth(delta: number) {
    setSelectedDay(null);
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  function goToday() {
    const now = new Date();
    setAdding(false);
    setError(null);
    setShowCal(false);
    setView("saldos");
    setCursor({ y: now.getFullYear(), m: now.getMonth() });
    setSelectedDay(now.getDate());
    const target = iso(now.getFullYear(), now.getMonth(), now.getDate());
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-day-row="${target}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  function shiftDay(delta: number) {
    if (selectedDay == null) return;
    const d = new Date(cursor.y, cursor.m, selectedDay + delta);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setSelectedDay(d.getDate());
  }

  const selectedRow = selectedDay == null ? null : rows.list[selectedDay - 1] ?? null;


  function resetForm() {
    setAmount("");
    setLabel("");
    setDebtName("");
    setFreq("unico");
    setInfinite(false);
    setInstallments("");
    setDaysOfMonth([]);
    setTags([]);
    setTagInput("");
    setEditTarget(null);
    setFormOrigin("standard");
  }

  const fmtAmount = (n: number) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /** abre o formulário já preenchido com tudo que o lançamento tem hoje */
  function startFullEdit(item: DayItem) {
    setError(null);
    setShowCal(false);
    setFormOrigin(item.horizonTransfer ? "horizon" : "standard");
    if (item.recurrenceId) {
      const r = recurrences.find((x) => x.id === item.recurrenceId);
      if (!r) return;
      setKind(r.kind as Kind);
      setAmount(fmtAmount(r.amount));
      setLabel(r.name || r.label);
      setDebtName(r.name || r.label);
      setTags(r.tags ?? []);
      setFormDate(r.startDate);
      setFreq(r.freq === "monthly" ? "mensal" : r.freq === "weekly" ? "semanal" : "diario");
      setInfinite(r.installments == null);
      setInstallments(r.freq === "weekly"
        ? r.installments == null ? "" : String(Math.min(r.installments, weeklyRepetitionLimit(r.startDate)))
        : r.installments == null ? "" : String(r.installments));
      setDaysOfMonth(r.daysOfMonth ?? []);
      setEditTarget({ type: "rec", id: r.id });
      setActiveItemKey(item.key);
      setWindowMode("edit");
      return;
    }
    if (item.entryId) {
      const en = entries.find((x) => x.id === item.entryId);
      if (!en) return;
      setKind(en.kind);
      setAmount(fmtAmount(en.amount));
      setLabel(en.label);
      setDebtName(en.label);
      setTags(en.tags ?? []);
      setFormDate(en.date);
      setFreq("unico");
      setInfinite(false);
      setInstallments("");
      setDaysOfMonth([]);
      setEditTarget({ type: "entry", id: en.id });
      setActiveItemKey(item.key);
      setWindowMode("edit");
    }
  }

  function scrollTableToStart() {

    tableRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  }

  function addTag(raw: string) {
    const t = raw.trim().slice(0, 24);
    if (!t) return;
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setTagInput("");
  }

  function shiftFormDate(days: number) {
    const p = formDate.split("-").map(Number);
    const d = new Date(p[0] ?? 1970, (p[1] ?? 1) - 1, (p[2] ?? 1) + days);
    setFormDate(iso(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  const formDateParts = useMemo(() => {
    const p = formDate.split("-").map(Number);
    return { y: p[0] ?? today.getFullYear(), m: (p[1] ?? 1) - 1, d: p[2] ?? 1 };
  }, [formDate]);
  const formMonthDays = new Date(formDateParts.y, formDateParts.m + 1, 0).getDate();
  const formWeekLimit = weeklyRepetitionLimit(formDate);
  const finiteRepetition = freq === "diario" || freq === "semanal";

  function saveEntry(e: React.FormEvent) {
    e.preventDefault();
    const value = parseAmount(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Informe um valor maior que zero.");
      return;
    }
    const date = formDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Escolha uma data válida.");
      return;
    }
    const { y, m, d } = formDateParts;
    const pendingTag = tagInput.trim().slice(0, 24);
    const cleanTags = (pendingTag && !tags.includes(pendingTag) ? [...tags, pendingTag] : tags).slice(0, 8);
    const horizonTransfer = formOrigin === "horizon" && kind === "economias";
    const dailyCount = freq === "diario" ? dailyRepetitionCount(installments) : null;
    if (freq === "diario" && dailyCount === null) {
      setError("É obrigatório preencher quantas diárias.");
      return;
    }
    const weeklyCount = freq === "semanal" ? weeklyRepetitionCount(installments, date) : null;
    if (freq === "semanal" && weeklyCount === null) {
      setError(dailyRepetitionCount(installments) !== null
        ? `Escolha até ${formWeekLimit} semana${formWeekLimit > 1 ? "s" : ""} para esta data.`
        : "É obrigatório preencher quantas semanas.");
      return;
    }
    const dailyDays = [...new Set(daysOfMonth)].filter((x) => x <= formMonthDays).sort((a, b) => a - b);
    if (freq === "diario" && dailyCount !== null) {
      if (dailyCount > formMonthDays) {
        setError(`Este mês tem no máximo ${formMonthDays} diárias.`);
        return;
      }
      if (dailyDays.length === 0) {
        setError("É obrigatório preencher os dias das diárias (Quais dias?).");
        return;
      }
      if (dailyDays.length !== dailyCount) {
        setError(`É obrigatório marcar exatamente ${dailyCount} dia${dailyCount > 1 ? "s" : ""} no calendário.`);
        return;
      }
    }

    // edição de um lançamento existente: preserva tudo, aplica só o que mudou
    if (editTarget) {
      const cleanLabel = label.trim() || (SUGGESTIONS[kind][0] ?? "Outro");
      const isRec = freq !== "unico";
      let parcelas: number | null = null;
      let dom: number[] = [];
      let dow: number[] = [];
      if (isRec) {
        parcelas = freq === "diario" ? dailyCount : freq === "semanal" ? weeklyCount : infinite ? null : Math.floor(Number(installments));
        if (freq === "mensal" && !infinite && (!Number.isFinite(parcelas) || (parcelas ?? 0) < 1)) {
          setError("Informe a quantidade de parcelas ou marque 'sem fim'.");
          return;
        }
        dom = freq === "mensal" ? [d] : freq === "diario" ? dailyDays : [];
        dow = freq === "semanal" ? [new Date(y, m, d).getDay()] : [];
      }
      const mappedFreq =
        freq === "mensal" ? "monthly" : freq === "semanal" ? "weekly" : "daily";
      setError(null);

      if (editTarget.type === "entry") {
        const original = entries.find((entry) => entry.id === editTarget.id);
        if (!original) return;
        if (isRec) {
          commit(entries.filter((en) => en.id !== editTarget.id), [
            ...recurrences,
            {
              id: crypto.randomUUID(),
              kind: original.kind,
              name: cleanLabel,
              label: cleanLabel,
              tags: cleanTags,
              amount: value,
              freq: mappedFreq,
              daysOfMonth: dom,
              daysOfWeek: dow,
              startDate: date,
              installments: parcelas,
              weeklyWithinStartMonth: freq === "semanal",
              endDate: null,
              skipped: [],
              horizonTransfer: original.horizonTransfer === true,
            },
          ]);
        } else {
          commit(
            entries.map((en) =>
              en.id === editTarget.id
                ? {
                    ...en,
                    amount: value,
                    label: cleanLabel,
                    tags: cleanTags,
                  }
                : en,
            ),
            recurrences,
          );
        }
      } else if (isRec) {
        const original = recurrences.find((recurrence) => recurrence.id === editTarget.id);
        if (!original) return;
        commit(
          entries,
          recurrences.map((r) =>
            r.id === editTarget.id
              ? {
                  ...r,
                  name: cleanLabel,
                  label: cleanLabel,
                  amount: value,
                  freq: mappedFreq,
                  daysOfMonth: dom,
                  daysOfWeek: dow,
                  installments: parcelas,
                  weeklyWithinStartMonth: freq === "semanal",
                  tags: cleanTags,
                }
              : r,
          ),
        );
      } else {
        const original = recurrences.find((recurrence) => recurrence.id === editTarget.id);
        if (!original) return;
        commit(
          [
            ...entries,
            {
              id: crypto.randomUUID(),
              amount: value,
              date: original.startDate,
              label: cleanLabel,
              kind: original.kind as Kind,
              tags: cleanTags,
              horizonTransfer: original.horizonTransfer === true,
            },
          ],
          recurrences.filter((r) => r.id !== editTarget.id),
        );
      }

      resetForm();
      setAdding(false);
      setSelectedDay(null);
      setCursor({ y, m });
      scrollTableToStart();
      return;
    }

    if (freq !== "unico") {

      const parcelas = freq === "diario" ? dailyCount : freq === "semanal" ? weeklyCount : infinite ? null : Math.floor(Number(installments));
      if (freq === "mensal" && !infinite && (!Number.isFinite(parcelas) || (parcelas ?? 0) < 1)) {
        setError("Informe a quantidade de parcelas ou marque 'sem fim'.");
        return;
      }
      const dom = freq === "mensal" ? [d] : freq === "diario" ? dailyDays : [];
      const dow = freq === "semanal" ? [new Date(y, m, d).getDay()] : [];
      setError(null);
      commit(entries, [
        ...recurrences,
        {
          id: crypto.randomUUID(),
          kind,
          name: debtName.trim() || label.trim() || (KINDS.find((k) => k.key === kind)?.title ?? "Outro"),
          label: label.trim() || (SUGGESTIONS[kind][0] ?? "Outro"),
          tags: cleanTags,
          amount: value,
          freq: freq === "mensal" ? "monthly" : freq === "semanal" ? "weekly" : "daily",
          daysOfMonth: dom,
          daysOfWeek: dow,
          startDate: date,
          installments: parcelas,
          weeklyWithinStartMonth: freq === "semanal",
          endDate: null,
          skipped: [],
          horizonTransfer,
        },
      ]);
      resetForm();
      setAdding(false);
      setSelectedDay(null);
      setCursor({ y, m });
      scrollTableToStart();
      return;
    }

    setError(null);
    commit(
      [
        ...entries,
        {
          id: crypto.randomUUID(),
          amount: value,
          date,
          label:
            debtName.trim() || label.trim() || (SUGGESTIONS[kind][0] ?? "Outro"),
          kind,
          tags: cleanTags,
          horizonTransfer,
        },
      ],
      recurrences,
    );
    resetForm();
    setAdding(false);
    setSelectedDay(null);
    setCursor({ y, m });
    scrollTableToStart();
  }



  function deleteItems(items: DayItem[]) {
    if (items.length === 0) return;
    const entryIds = new Set(items.filter((i) => i.entryId).map((i) => i.entryId!));
    const skips = items.filter((i) => i.recurrenceId);
    // caminho inverso: apagou a saída da previsão no calendário → limpa a previsão
    if (skips.some((s) => s.recurrenceId === FORECAST_ID)) {
      commit(
        entries.filter((e) => !entryIds.has(e.id)),
        recurrences.filter((r) => r.id !== FORECAST_ID),
      );
      setForecastItems([]);
      setSelected({});
      return;
    }
    commit(
      entries.filter((e) => !entryIds.has(e.id)),
      recurrences.map((r) => {
        const dates = skips.filter((s) => s.recurrenceId === r.id).map((s) => s.date);
        return dates.length ? { ...r, skipped: [...r.skipped, ...dates] } : r;
      }),
    );
    setSelected({});
  }

  function removeEntry(id: string) {
    commit(
      entries.filter((e) => e.id !== id),
      recurrences,
    );
  }

  /** edita o valor de um lançamento avulso */
  function updateEntryAmount(id: string, value: number) {
    commit(
      entries.map((e) => (e.id === id ? { ...e, amount: value } : e)),
      recurrences,
    );
  }

  /** edita o valor de uma parcela/recorrência (vale para todas as ocorrências) */
  function updateRecurrenceAmount(recurrenceId: string, value: number) {
    commit(
      entries,
      recurrences.map((r) => (r.id === recurrenceId ? { ...r, amount: value } : r)),
    );
  }

  /** ajuste de um dia da previsão diária: null apaga, número = gasto real, undefined restaura */
  function setForecastDay(date: string, value: number | null | undefined) {
    commit(
      entries,
      recurrences.map((r) => {
        if (r.id !== FORECAST_ID) return r;
        const next = { ...(r.dayEdits ?? {}) };
        if (value === undefined) delete next[date];
        else next[date] = value;
        return { ...r, dayEdits: next };
      }),
    );
  }

  function skipOccurrence(recurrenceId: string, date: string) {
    commit(
      entries,
      recurrences.map((r) =>
        r.id === recurrenceId ? { ...r, skipped: [...r.skipped, date] } : r,
      ),
    );
  }

  function endRecurrenceFrom(recurrenceId: string, date: string) {
    const before = new Date(date);
    before.setDate(before.getDate() - 1);
    const end = iso(before.getFullYear(), before.getMonth(), before.getDate());
    commit(
      entries,
      recurrences.flatMap((r) =>
        r.id !== recurrenceId ? [r] : end < r.startDate ? [] : [{ ...r, endDate: end }],
      ),
    );
  }

  function removeRecurrence(recurrenceId: string) {
    commit(
      entries,
      recurrences.filter((r) => r.id !== recurrenceId),
    );
    // caminho inverso: apagou a saída automática no calendário → limpa a previsão
    if (recurrenceId === FORECAST_ID) setForecastItems([]);
  }

  /** leva da origem (Economias no calendário) até o dia exato no Horizonte */
  function jumpToHorizon(item: DayItem) {
    const [yy, mm] = item.date.split("-").map(Number);
    setAdding(false);
    setError(null);
    setShowCal(false);
    setEditTarget(null);
    setActiveItemKey(null);
    setHorizonStart({ y: yy ?? today.getFullYear(), m: (mm ?? 1) - 1 });
    setView("horizonte");
    setHorizonHighlight(item.date);
    setHorizonJump({ item, amount: fmtAmount(item.amount), ask: null, error: null });
  }

  // Aguarda o mês de destino ser renderizado antes de centralizar o dia.
  // Assim, saltos para anos distantes também chegam à célula correta.
  useEffect(() => {
    if (view !== "horizonte" || !horizonHighlight) return;
    const frame = requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(
        `[data-horizon-day="${horizonHighlight}"]`,
      );
      target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [view, horizonHighlight, horizonStart]);

  /** aplica salvar/desfazer da janela do Horizonte */
  function applyHorizonJump(action: "save" | "undo", scope: "day" | "all") {
    if (!horizonJump) return;
    const { item } = horizonJump;
    const value = action === "undo" ? 0 : parseAmount(horizonJump.amount);
    if (!Number.isFinite(value) || value < 0) {
      setHorizonJump({ ...horizonJump, ask: null, error: "Informe um valor válido." });
      return;
    }
    const remove = value === 0;
    if (item.entryId) {
      if (remove) removeEntry(item.entryId);
      else updateEntryAmount(item.entryId, value);
    } else if (item.recurrenceId) {
      const r = recurrences.find((x) => x.id === item.recurrenceId);
      if (!r) return;
      if (scope === "all") {
        if (remove) removeRecurrence(r.id);
        else updateRecurrenceAmount(r.id, value);
      } else {
        const nextRecs = recurrences.map((x) =>
          x.id === r.id ? { ...x, skipped: [...x.skipped, item.date] } : x,
        );
        const nextEntries = remove
          ? entries
          : [
              ...entries,
              {
                id: crypto.randomUUID(),
                amount: value,
                date: item.date,
                label: r.name || r.label,
                kind: "economias" as Kind,
                tags: r.tags ?? [],
                horizonTransfer: true,
              },
            ];
        commit(nextEntries, nextRecs);
      }
    }
    setHorizonJump(null);
  }

  function deleteAll() {
    commit([], []);
    setForecastItems([]);
    setSelected({});
    setConfirmAll(null);
  }

  /** apaga tudo dentro de um intervalo de datas (mês ou ano) */
  function clearRange(startIso: string, endIso: string, months: { y: number; m: number }[]) {
    const skipByRec = new Map<string, string[]>();
    for (const r of recurrences) {
      const dates: string[] = [];
      for (const mo of months) {
        for (const o of occurrencesInMonth(r, mo.y, mo.m)) {
          if (o.date >= startIso && o.date <= endIso) dates.push(o.date);
        }
      }
      if (dates.length) skipByRec.set(r.id, dates);
    }
    commit(
      entries.filter((e) => e.date < startIso || e.date > endIso),
      recurrences.map((r) => {
        const dates = skipByRec.get(r.id);
        return dates ? { ...r, skipped: [...r.skipped, ...dates] } : r;
      }),
    );
    setSelected({});
    setConfirmAll(null);
  }

  function clearMonth() {
    const last = new Date(cursor.y, cursor.m + 1, 0).getDate();
    clearRange(iso(cursor.y, cursor.m, 1), iso(cursor.y, cursor.m, last), [
      { y: cursor.y, m: cursor.m },
    ]);
  }

  function clearMonthForDate(y: number, m: number) {
    const last = new Date(y, m + 1, 0).getDate();
    clearRange(iso(y, m, 1), iso(y, m, last), [{ y, m }]);
  }

  function clearYear() {
    clearRange(
      iso(cursor.y, 0, 1),
      iso(cursor.y, 11, 31),
      Array.from({ length: 12 }, (_, m) => ({ y: cursor.y, m })),
    );
  }



  const isToday = (day: number) =>
    cursor.y === today.getFullYear() && cursor.m === today.getMonth() && day === today.getDate();

  const chip = (active: boolean) =>
    `h-8 min-w-8 rounded-lg border px-2 text-xs font-medium transition-colors ${
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-input bg-background text-muted-foreground hover:bg-accent"
    }`;

  const actionBtn =
    "h-8 rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";
  const dangerBtn =
    "h-8 rounded-lg border border-negative/40 bg-negative/10 px-2.5 text-xs font-semibold text-negative transition-colors hover:bg-negative/20";

  const monthItems = rows.list.flatMap((r) => r.items);
  const selectedList = Object.values(selected);


  function selectMany(items: DayItem[]) {
    setSelected((prev) => {
      const next = { ...prev };
      for (const it of items) next[it.key] = it;
      return next;
    });
  }


  const navBtn =
    "grid size-9 shrink-0 place-items-center rounded-full border-[1.5px] border-foreground/30 text-lg font-bold leading-none text-foreground transition-colors hover:bg-accent";

  /** no Horizonte a página inteira vira o quadro: sem rolagem da página, tudo esticado */
  const isHorizon = view === "horizonte" && !adding;

  /** no calendário (saldos) aproveitamos a tela como no Horizonte: laterais e topo mais justos */
  const isSaldos = view === "saldos" && !adding;

  if (!loaded) return <LoadingScreen />;

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar
        onAdd={() => {
          resetForm();
          setError(null);
          setShowCal(false);
          const sameMonth = cursor.y === today.getFullYear() && cursor.m === today.getMonth();
          const day = selectedDay ?? (sameMonth ? today.getDate() : 1);
          setSelectedDay(day);
          setFormDate(iso(cursor.y, cursor.m, day));
          setKind("entradas");
          setWindowKind("entradas");
          setEditTarget(null);
          setFormOrigin("standard");
          setActiveItemKey(null);
          setWindowMode("add");
          setAdding(true);
        }}
        onToday={goToday}
        active={view === "diario" ? "menu" : view}
        onNavigate={(key) => {
          setAdding(false);
          setError(null);
          setShowCal(false);
          if (key === "horizonte") {
            setHorizonStart({ y: cursor.y, m: cursor.m });
            setView("horizonte");
          } else if (key === "menu") {
            setView("diario");
          } else if (key === "totais" || key === "tags") {
            setView(key);

          } else {
            setView("saldos");
          }
        }}
      />

      <div className={isHorizon ? "flex h-screen min-w-0 flex-1 flex-col overflow-hidden" : "min-w-0 flex-1"}>
        <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
          <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 ${isHorizon || isSaldos ? "px-3 py-1.5 sm:px-4" : "px-5 py-3 sm:px-8"}`}>
            <h1 className={`truncate font-display font-semibold text-foreground ${isHorizon ? "text-lg" : "text-xl sm:text-2xl"}`}>
              {view === "diario"
                ? `previsão gasto diário de ${today.toLocaleDateString("pt-BR", { month: "long" })}`
                : view}
            </h1>
            <div className={`flex shrink-0 items-center gap-1 ${view === "horizonte" || view === "menu" || view === "diario" ? "hidden" : ""}`}>
              <button onClick={() => shiftMonth(-12)} aria-label="Ano anterior" className={navBtn}>
                «
              </button>
              <button onClick={() => shiftMonth(-1)} aria-label="Mês anterior" className={navBtn}>
                ‹
              </button>
              <span className="min-w-44 rounded-full border-[1.5px] border-foreground/30 px-4 py-1.5 text-center text-sm font-medium capitalize text-foreground">
                {monthLabel(cursor.y, cursor.m)}
              </span>
              <button onClick={() => shiftMonth(1)} aria-label="Próximo mês" className={navBtn}>
                ›
              </button>
              <button onClick={() => shiftMonth(12)} aria-label="Próximo ano" className={navBtn}>
                »
              </button>
              <button
                onClick={goToday}
                className="ml-1 h-9 rounded-full border-[1.5px] border-foreground/30 px-3 text-xs font-bold text-foreground transition-colors hover:bg-accent"
              >
                hoje
              </button>
            </div>
          </div>
        </header>

      <main className={isHorizon ? "flex min-h-0 w-full flex-1 flex-col px-2 py-2 sm:px-3" : isSaldos ? "w-full space-y-4 px-2 py-2 sm:px-3" : "w-full space-y-6 px-5 py-6 sm:px-8"}>
        {view === "horizonte" && !adding ? (
          <>
          {horizonJump && (() => {
            const j = horizonJump;
            const isRec = !!j.item.recurrenceId;
            const run = (action: "save" | "undo") => {
              if (isRec) setHorizonJump({ ...j, ask: action, error: null });
              else applyHorizonJump(action, "day");
            };
            return (
              <AddWindow
                title="ajustar poupança"
                subtitle={longDate(j.item.date)}
                onClose={() => setHorizonJump(null)}
              >
                <div className="space-y-3">
                  <div className="rounded-2xl bg-card p-4">
                    <p className="text-xs font-medium text-muted-foreground">identificação</p>
                    <p className="mt-1 text-base font-semibold text-foreground">{j.item.detail}</p>
                  </div>
                  <div className="rounded-2xl bg-card p-4">
                    <span className="text-xs font-medium text-muted-foreground">valor</span>
                    <MoneyInput
                      autoFocus
                      maxLength={20}
                      value={j.amount}
                      onValueChange={(v) => setHorizonJump({ ...j, amount: v, ask: null, error: null })}
                      placeholder="0,00"
                      className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 font-display text-2xl font-bold tabular-nums text-foreground outline-none focus:border-primary"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">deixe 0 para zerar e devolver ao saldo.</p>
                  </div>
                  {j.error && <p className="text-xs font-semibold text-negative">{j.error}</p>}
                  {j.ask ? (
                    <div className="space-y-2 rounded-2xl bg-card p-4">
                      <p className="text-sm font-semibold text-foreground">
                        {j.ask === "undo" ? "desfazer em:" : "salvar em:"}
                      </p>
                      <button
                        type="button"
                        onClick={() => applyHorizonJump(j.ask!, "day")}
                        className="h-11 w-full rounded-xl bg-primary/10 text-sm font-semibold text-primary hover:bg-primary/20"
                      >
                        só este dia
                      </button>
                      <button
                        type="button"
                        onClick={() => applyHorizonJump(j.ask!, "all")}
                        className="h-11 w-full rounded-xl bg-warning/20 text-sm font-semibold text-warning-foreground hover:bg-warning/30"
                      >
                        todas as repetições
                      </button>
                      <button
                        type="button"
                        onClick={() => setHorizonJump({ ...j, ask: null })}
                        className="h-9 w-full text-xs font-medium text-muted-foreground"
                      >
                        voltar
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => run("undo")}
                        className="h-11 rounded-xl border border-negative/40 bg-negative/10 text-sm font-semibold text-negative hover:bg-negative/20"
                      >
                        desfazer
                      </button>
                      <button
                        type="button"
                        onClick={() => run("save")}
                        className="h-11 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90"
                      >
                        salvar
                      </button>
                    </div>
                  )}
                </div>
              </AddWindow>
            );
          })()}
          <HorizonBoard
            highlightDate={horizonHighlight}
            months={horizonMonths}
            todayIso={iso(today.getFullYear(), today.getMonth(), today.getDate())}
            onShift={(delta) =>
              setHorizonStart((h) => {
                const d = new Date(h.y, h.m + delta, 1);
                return { y: d.getFullYear(), m: d.getMonth() };
              })
            }
            onPick={(y, m, day) => {
              setHorizonHighlight(null);
              resetForm();
              setError(null);
              setShowCal(false);
              setCursor({ y, m });
              setSelectedDay(day);
              setFormDate(iso(y, m, day));
              setKind("economias");
              setWindowKind("economias");
              setEditTarget(null);
              setFormOrigin("horizon");
              setActiveItemKey(null);
              setWindowMode("add");
              setAdding(true);
            }}
          />
          </>
        ) : view === "totais" && !adding ? (
          <TotalsBoard data={totalsData} />
        ) : (view === "diario" || view === "menu") && !adding ? (
          <DailyForecastBoard
            items={forecastItems}
            year={today.getFullYear()}
            month={today.getMonth()}
            onSave={(item) =>
              setForecastItems((prev) => {
                const exists = prev.some((p) => p.id === item.id);
                return exists ? prev.map((p) => (p.id === item.id ? item : p)) : [...prev, item];
              })
            }
            onDelete={(id) => setForecastItems((prev) => prev.filter((p) => p.id !== id))}
            onBack={() => setView("saldos")}
          />
        ) : view === "tags" && !adding ? (
          <TagsBoard
            rows={tagRows}
            onRename={renameTag}
            onDelete={deleteTag}
            onAdd={() => {
              resetForm();
              setError(null);
              setShowCal(false);
              const sameMonth = cursor.y === today.getFullYear() && cursor.m === today.getMonth();
              const day = sameMonth ? today.getDate() : 1;
              setFormDate(iso(cursor.y, cursor.m, day));
              setKind("entradas");
              setWindowKind("entradas");
              setEditTarget(null);
              setFormOrigin("standard");
              setActiveItemKey(null);
              setWindowMode("add");
              setAdding(true);
            }}
          />
        ) : (
          <>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">saldo anterior</p>
            <p className="mt-1 text-lg font-semibold text-foreground"><FitMoney value={rows.opening} /></p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">entradas do mês</p>
            <p className="mt-1 text-lg font-semibold text-positive"><FitMoney value={monthTotals.entradas} /></p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">saldo final</p>
            <p
              className={`mt-1 flex items-center gap-2 text-lg font-semibold ${
                saldoCell[closingStatus].split(" ")[1]
              }`}
            >
              <span className={`size-2.5 rounded-full ${dotClass[closingStatus]}`} />
              <FitMoney value={rows.closing} />
            </p>
          </div>
        </section>

        <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
          {confirmAll === "tudo" ? (
            <>
              <button onClick={deleteAll} className={dangerBtn}>
                confirmar: resetar tudo (sistema)
              </button>
              <button onClick={() => setConfirmAll(null)} className={actionBtn}>
                cancelar
              </button>
            </>
          ) : (
            <button onClick={() => setConfirmAll("tudo")} className={dangerBtn}>
              resetar tudo (sistema)
            </button>
          )}
        </section>



        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className={`sticky z-20 overflow-hidden rounded-t-2xl border border-b-0 border-border bg-secondary ${isSaldos ? "top-[49px]" : "top-[61px]"}`}>
            <div
              ref={tableHeaderRef}
              className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onScroll={(event) => {
                if (tableRef.current && tableRef.current.scrollLeft !== event.currentTarget.scrollLeft) {
                  tableRef.current.scrollLeft = event.currentTarget.scrollLeft;
                }
              }}
            >
            <div
              className={`grid min-w-[760px] ${GRID} items-stretch px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground`}
            >
              <span className="flex items-center">dia</span>
              {KINDS.map((k) => (
                <span
                  key={k.key}
                  className="flex items-center justify-end gap-1.5 border-l border-border/70 px-2"
                >
                  <SectionBadge kind={k.key} compact />
                  {k.title}
                </span>
              ))}
              <span data-fit
                        className="flex min-w-0 items-center justify-end overflow-hidden border-l border-border/70 px-2">
                saldos
              </span>
            </div>
            </div>
          </div>

          <section
            ref={tableRef}
            className="min-w-0 overflow-x-auto rounded-b-2xl border border-border bg-card"
            onScroll={(event) => {
              if (tableHeaderRef.current && tableHeaderRef.current.scrollLeft !== event.currentTarget.scrollLeft) {
                tableHeaderRef.current.scrollLeft = event.currentTarget.scrollLeft;
              }
            }}
          >
          <div className="min-w-[760px]">

            <div className="divide-y divide-border">
              {rows.list.map((row) => {
                const s = statusOf(row.balance);
                const open = selectedDay === row.day;
                return (
                  <div key={row.date} data-day-row={row.date}>
                    <button
                      onClick={(ev) => {
                        resetForm();
                        setError(null);
                        setShowCal(false);
                        setSelectedDay(row.day);
                        setFormDate(row.date);
                        const clickedKind = (ev.target as HTMLElement)
                          .closest("[data-kind]")
                          ?.getAttribute("data-kind") as Kind | "saldos" | null;
                        // clique fora de uma coluna (cantos/espaços): não abre nada
                        if (!clickedKind) return;
                        const openingKind = clickedKind;
                        const categoryItems = row.items.filter(
                          (item) => item.recurrenceId !== FORECAST_ID && item.kind === openingKind,
                        );
                        // saldos e diários: só reflexo (manipulação nas outras colunas / no Menu)
                        if (openingKind === "saldos") {
                          setWindowKind("saldos");
                          setEditTarget(null);
                          setActiveItemKey(null);
                          setFormOrigin("standard");
                          setWindowMode("info");
                          setAdding(true);
                          return;
                        }
                        if (openingKind === "diarios") {
                          setKind("diarios");
                          setWindowKind("diarios");
                          setEditTarget(null);
                          setActiveItemKey(null);
                          setFormOrigin("standard");
                          setWindowMode("info");
                          setAdding(true);
                          return;
                        }
                        // poupança: sempre só reflexo (manipulação no Horizonte)
                        if (openingKind === "economias") {
                          setWindowKind("economias");
                          setEditTarget(null);
                          setActiveItemKey(
                            categoryItems.find((item) => item.horizonTransfer)?.key ?? null,
                          );
                          setFormOrigin("standard");
                          setWindowMode("info");
                          setAdding(true);
                          return;
                        }
                        resetForm();
                        setError(null);
                        setShowCal(false);
                        setSelectedDay(row.day);
                        setFormDate(row.date);
                        setKind(openingKind);
                        setWindowKind(openingKind);
                        setEditTarget(null);
                        setFormOrigin("standard");
                        const monthListKind =
                          openingKind === "entradas" ||
                          openingKind === "saidas" ||
                          openingKind === "cartao";
                        setActiveItemKey(
                          !monthListKind && categoryItems.length === 1
                            ? categoryItems[0]?.key ?? null
                            : null,
                        );
                        setWindowMode(
                          categoryItems.length === 0
                            ? "add"
                            : monthListKind
                              ? "month"
                              : categoryItems.length === 1
                                ? "detail"
                                : "list",
                        );
                        setAdding(true);
                      }}
                      className={`grid w-full ${GRID} items-stretch px-3 py-2.5 text-left transition-colors hover:bg-accent/50 ${
                        open ? "bg-accent/60" : ""
                      } ${isToday(row.day) ? "border-b-2 border-foreground" : ""}`}
                    >
                      <span
                        className={`grid size-8 place-items-center rounded-lg text-sm font-semibold ${
                          isToday(row.day)
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {row.day}
                      </span>
                      {KINDS.map((k) => (
                        <span
                          key={k.key}
                          data-kind={k.key}
                          className={`flex min-w-0 items-center justify-end overflow-hidden border-l border-border/70 px-2 text-sm tabular-nums ${
                            row.totals[k.key] > 0
                              ? `font-medium ${kindTone[k.key]}`
                              : "text-muted-foreground/60"
                          }`}
                        >
                          <FitMoney value={row.totals[k.key]} />
                        </span>
                      ))}
                      <span
                        data-kind="saldos"
                        data-fit
                        className="flex min-w-0 items-center justify-end overflow-hidden border-l border-border/70 px-2"
                      >
                        <span
                          className={`min-w-0 rounded-lg px-2.5 py-1 text-right text-sm font-semibold tabular-nums ${saldoCell[s]}`}
                        >
                          <FitMoney value={row.balance} />
                        </span>
                      </span>
                    </button>

                  </div>
                );
              })}
            </div>

            <div
              className={`grid ${GRID} items-stretch border-t border-border bg-secondary px-3 py-3 text-sm font-semibold`}
            >
              <span className="flex items-center text-xs uppercase tracking-wide text-muted-foreground">
                total
              </span>
              {KINDS.map((k) => (
                <span
                  key={k.key}
                  className={`flex min-w-0 items-center justify-end overflow-hidden border-l border-border/70 px-2 tabular-nums ${kindTone[k.key]}`}
                >
                  <FitMoney value={monthTotals[k.key]} />
                </span>
              ))}
              <span data-fit
                        className="flex min-w-0 items-center justify-end overflow-hidden border-l border-border/70 px-2">
                <span
                  className={`min-w-0 rounded-lg px-2.5 py-1 text-right tabular-nums ${saldoCell[closingStatus]}`}
                >
                  <FitMoney value={rows.closing} />
                </span>
              </span>
            </div>

          </div>
        </section>
        </div>




        {adding && (() => {
          const windowDayRow =
            formDateParts.y === cursor.y && formDateParts.m === cursor.m
              ? rows.list[formDateParts.d - 1] ?? null
              : null;
          const windowDayItems = (windowDayRow?.items ?? []).filter(
            (it) => it.recurrenceId !== FORECAST_ID && it.kind === windowKind,
          );
          const monthPrefix = iso(formDateParts.y, formDateParts.m, 1).slice(0, 7);
          const monthHasItems =
            entries.some((e) => e.date.startsWith(monthPrefix)) ||
            recurrences.some((r) => occurrencesInMonth(r, formDateParts.y, formDateParts.m).length > 0);
          const activeItem = windowDayItems.find((item) => item.key === activeItemKey) ?? null;
          const closeWindow = () => {
            setAdding(false);
            setForecastRestoring(false);
            setError(null);
            setShowCal(false);
            setEditTarget(null);
            setActiveItemKey(null);
          };
          const detailDeleteActions = activeItem
            ? activeItem.recurrenceId
              ? [
                  {
                    key: "occurrence",
                    label: "apagar só este lançamento",
                    onSelect: () => {
                      skipOccurrence(activeItem.recurrenceId ?? "", activeItem.date);
                      closeWindow();
                    },
                  },
                  {
                    key: "future",
                    label: "apagar desta data em diante",
                    tone: "warning" as const,
                    onSelect: () => {
                      endRecurrenceFrom(activeItem.recurrenceId ?? "", activeItem.date);
                      closeWindow();
                    },
                  },
                  {
                    key: "recurrence",
                    label: "apagar recorrência inteira",
                    onSelect: () => {
                      removeRecurrence(activeItem.recurrenceId ?? "");
                      closeWindow();
                    },
                  },
                ]
              : [
                  {
                    key: "entry",
                    label: "apagar lançamento",
                    onSelect: () => {
                      deleteItems([activeItem]);
                      closeWindow();
                    },
                  },
                ]
            : undefined;
          const horizonAddWindow =
            windowMode === "add" &&
            ((windowKind === "economias" && formOrigin === "horizon") ||
              windowKind === "entradas" ||
              windowKind === "saidas" ||
              windowKind === "cartao");
          return (
          <AddWindow
            title={
              windowMode === "month"
                ? (KINDS.find((item) => item.key === windowKind)?.title ?? "lançamentos")
                : windowMode === "add"
                ? `adicionar ${KINDS.find((item) => item.key === windowKind)?.title ?? "lançamento"}`
                : windowMode === "list"
                  ? (KINDS.find((item) => item.key === windowKind)?.title ?? "lançamentos")
                  : windowMode === "edit"
                    ? "editar"
                    : windowMode === "info"
                      ? (KINDS.find((item) => item.key === windowKind)?.title ??
                          (windowKind === "saldos" ? "saldos" : "diários"))
                      : "detalhes"
            }
            subtitle={
              horizonAddWindow
                ? undefined
                : windowMode === "month"
                  ? new Date(formDateParts.y, formDateParts.m, 1).toLocaleDateString("pt-BR", {
                      month: "long",
                      year: "numeric",
                    })
                : new Date(formDateParts.y, formDateParts.m, formDateParts.d).toLocaleDateString(
                    "pt-BR",
                    { day: "2-digit", month: "long", year: "numeric" },
                  )
            }
            dateHero={
              horizonAddWindow
                ? {
                    day: String(formDateParts.d).padStart(2, "0"),
                    month: new Date(formDateParts.y, formDateParts.m, 1).toLocaleDateString(
                      "pt-BR",
                      { month: "long" },
                    ),
                    year: String(formDateParts.y),
                  }
                : undefined
            }
            deleteActions={windowMode === "detail" ? detailDeleteActions : undefined}
            onClose={closeWindow}
          >
            {windowMode === "month" && (
              <div className="space-y-2 pt-2">

                {rows.list
                  .map((r) => ({
                    row: r,
                    items: r.items.filter(
                      (it) => it.recurrenceId !== FORECAST_ID && it.kind === windowKind,
                    ),
                  }))
                  .filter((g) => g.items.length > 0)
                  .map(({ row: r, items }) => {
                    const highlighted = r.day === formDateParts.d;
                    return (
                      <div
                        key={r.date}
                        className={`rounded-xl bg-card p-2 ${
                          highlighted ? "ring-2 ring-primary" : ""
                        }`}
                      >
                        <p
                          className={`px-2 pt-1 pb-1 text-xs font-bold uppercase tracking-wide ${
                            highlighted ? "text-primary" : "text-muted-foreground"
                          }`}
                        >
                          dia {r.day}
                        </p>
                        {items.map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => {
                              setFormDate(item.date);
                              setSelectedDay(r.day);
                              setActiveItemKey(item.key);
                              setWindowMode("detail");
                            }}
                            className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent"
                          >
                            <CalendarItemLabel
                              label={monthItemLabel(item.detail, Boolean(item.recurrenceId))}
                              kind={item.kind}
                              tags={item.tags}
                            />
                            <span className={`text-sm font-bold tabular-nums ${kindTone[item.kind]}`}>
                              <FitMoney value={item.amount} />
                            </span>
                            <span aria-hidden className="text-muted-foreground">›</span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
              </div>
            )}

            {windowMode === "list" && (
              <div className="space-y-2">
                {windowDayItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setActiveItemKey(item.key);
                      setWindowMode("detail");
                    }}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl bg-card p-4 text-left transition-colors hover:bg-accent"
                  >
                    <CalendarItemLabel label={item.detail} kind={item.kind} tags={item.tags} />
                    <span className={`text-sm font-bold tabular-nums ${kindTone[item.kind]}`}>
                      <FitMoney value={item.amount} />
                    </span>
                    <span aria-hidden className="text-muted-foreground">›</span>
                  </button>
                ))}
              </div>
            )}

            {windowMode === "info" && (
              <div className="rounded-2xl bg-card p-4">
                <p className="text-sm leading-relaxed font-semibold text-foreground">
                  Para adicionar ou retirar novos valores, use{" "}
                  {windowKind === "saldos" ? (
                    <span className="font-bold tracking-wide text-primary">as outras colunas</span>
                  ) : windowKind === "economias" ? (
                    <>
                      o{" "}
                      <span className="font-bold tracking-wide text-primary">Horizonte</span>
                    </>
                  ) : (
                    <>
                      o{" "}
                      <span className="font-bold tracking-wide text-primary uppercase">Menu</span>
                    </>
                  )}
                  .
                </p>
                {windowKind === "diarios" && (() => {
                  const fr = recurrences.find((r) => r.id === FORECAST_ID);
                  if (!fr) return null;
                  const edit = fr.dayEdits?.[formDate];
                  const dayValue =
                    windowDayRow?.items.find((it) => it.recurrenceId === FORECAST_ID)?.amount ?? 0;
                  return (
                    <div className="mt-4 space-y-3 border-t border-border pt-4">
                      <p className="text-xs font-medium text-muted-foreground">
                        valor do dia {edit === null ? "(apagado — recalculado)" : typeof edit === "number" ? "(gasto real)" : ""}
                      </p>
                      {(() => {
                        const saveTop = edit !== undefined || forecastRestoring;
                        const save = () => {
                          if (saveTop && !forecastSpent.trim()) {
                            setForecastSpent("");
                            closeWindow();
                            return;
                          }
                          const v = parseAmount(forecastSpent);
                          if (!forecastSpent.trim() || !Number.isFinite(v) || v < 0) {
                            setForecastShake((n) => n + 1);
                            return;
                          }
                          setForecastDay(formDate, v);
                          setForecastSpent("");
                          closeWindow();
                        };
                        const saveBtn = (
                          <button
                            type="button"
                            onClick={save}
                            className="h-10 shrink-0 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground"
                          >
                            salvar
                          </button>
                        );
                        return (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-display text-2xl font-bold tabular-nums text-negative">
                                <FitMoney value={dayValue} />
                              </p>
                              {saveTop && saveBtn}
                            </div>
                            {(
                              <div className="flex gap-2">
                                <div
                                  key={forecastShake}
                                  className={`flex h-10 min-w-0 flex-1 items-center gap-1 rounded-xl border bg-background px-3 ${
                                    forecastShake ? "animate-shake border-destructive" : "border-border focus-within:border-ring"
                                  }`}
                                >
                                  <span className="text-base text-muted-foreground">R$</span>
                                  <MoneyInput
                                    placeholder="gastei outro valor"
                                    value={forecastSpent}
                                    onValueChange={(v) => {
                                      setForecastShake(0);
                                      setForecastSpent(v);
                                    }}
                                    wrapperClassName="h-full min-w-0 flex-1"
                                    className="h-full w-full min-w-0 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
                                  />
                                </div>
                                {!saveTop && saveBtn}
                              </div>
                            )}
                          </>
                        );
                      })()}
                      {forecastRestoring ? null : edit !== undefined ? (
                        <button
                          type="button"
                          onClick={() => {
                            setForecastDay(formDate, undefined);
                            setForecastSpent("");
                            setForecastRestoring(true);
                          }}
                          className="h-10 w-full rounded-xl border border-primary/40 bg-primary/15 text-sm font-semibold text-primary"
                        >
                          restaurar
                        </button>
                      ) : forecastConfirm ? (
                        <div className="space-y-2 rounded-xl border border-destructive/40 p-3">
                          <p className="text-sm font-semibold text-foreground">Tem certeza?</p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setForecastDay(formDate, null);
                                setForecastConfirm(false);
                                closeWindow();
                              }}
                              className="h-9 flex-1 rounded-lg bg-destructive text-sm font-semibold text-destructive-foreground"
                            >
                              sim, apagar
                            </button>
                            <button
                              type="button"
                              onClick={() => setForecastConfirm(false)}
                              className="h-9 flex-1 rounded-lg border border-border text-sm font-semibold text-foreground"
                            >
                              cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setForecastConfirm(true)}
                          className="h-10 w-full rounded-xl border border-destructive/40 text-sm font-semibold text-destructive"
                        >
                          apagar valor
                        </button>
                      )}
                    </div>
                  );
                })()}
                {windowKind === "economias" && activeItem?.horizonTransfer && (
                  <button
                    type="button"
                    onClick={() => jumpToHorizon(activeItem)}
                    aria-label="Ir para este dia no Horizonte"
                    className="mt-3 inline-flex h-8 items-center gap-1 rounded-lg border border-primary/40 bg-primary/15 px-3 text-sm font-semibold text-primary"
                  >
                    ir ao Horizonte
                    <span aria-hidden>›</span>
                  </button>
                )}
              </div>
            )}

            {windowMode === "detail" && activeItem && (
              <div className="space-y-3">
                <div className="rounded-2xl bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground">identificação</p>
                  <p className="mt-1 text-base font-semibold text-foreground">{activeItem.detail}</p>
                </div>
                <div className="rounded-2xl bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground">valor</p>
                  <p className={`mt-1 font-display text-2xl font-bold tabular-nums ${kindTone[activeItem.kind]}`}>
                    <FitMoney value={activeItem.amount} />
                  </p>
                </div>
                {activeItem.kind === "economias" ? (
                  activeItem.horizonTransfer ? (
                    <button
                      type="button"
                      onClick={() => jumpToHorizon(activeItem)}
                      aria-label="Ir para este dia no Horizonte"
                      className="block w-full rounded-2xl border border-primary/30 bg-card p-4 text-left transition-colors"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-muted-foreground">origem</span>
                        <span className="inline-flex h-8 items-center gap-1 rounded-lg border border-primary/40 bg-primary/15 px-3 text-sm font-semibold text-primary">
                          ir ao Horizonte
                          <span aria-hidden>›</span>
                        </span>
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-foreground">
                        {`Poupado do Horizonte em ${longDate(activeItem.date)}`}
                      </span>
                      <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">
                        Para adicionar ou poupar valores, use o Horizonte.
                      </span>
                    </button>
                  ) : (
                  <div className="rounded-2xl bg-card p-4">
                    <p className="text-xs font-medium text-muted-foreground">origem</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {`Lançado em ${longDate(activeItem.date)}`}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      Para adicionar ou poupar valores, use o Horizonte.
                    </p>
                  </div>
                  )
                ) : (
                <button
                  type="button"
                  onClick={() => startFullEdit(activeItem)}
                  className="h-11 w-full rounded-xl border border-primary/40 bg-primary/10 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
                >
                  editar
                </button>
                )}
              </div>
            )}

            {(windowMode === "add" || windowMode === "edit") && (
            <form onSubmit={saveEntry} className="space-y-3">
              {/* valor */}
              <div className="rounded-2xl bg-card p-4">
                <span className="text-xs font-medium text-muted-foreground">
                  {freq !== "unico" ? "valor da parcela" : "valor"}
                </span>
                <MoneyInput
                  autoFocus
                  maxLength={20}
                  value={amount}
                  onValueChange={setAmount}
                  placeholder="0,00"
                  className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 font-display text-2xl font-bold tabular-nums text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                />
              </div>

              {/* identificação */}
              <div className="rounded-2xl bg-card p-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">identificação</span>
                  <input
                    list={`labels-${kind}`}
                    maxLength={40}
                    value={label}
                    onChange={(ev) => setLabel(ev.target.value)}
                    placeholder={SUGGESTIONS[kind][0]}
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                  />
                  <datalist id={`labels-${kind}`}>
                    {SUGGESTIONS[kind].map((l) => (
                      <option key={l} value={l} />
                    ))}
                  </datalist>
                </label>
              </div>

              {/* data */}
              {windowMode === "add" && <div className="rounded-2xl bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-muted-foreground">data</span>
                  <button
                    type="button"
                    onClick={() => setShowCal((v) => !v)}
                    className="rounded-xl bg-accent px-3 py-1.5 text-sm font-semibold text-foreground"
                  >
                    {new Date(
                      formDateParts.y,
                      formDateParts.m,
                      formDateParts.d,
                    ).toLocaleDateString("pt-BR")}
                  </button>
                </div>
                {showCal && (
                  <div className="mt-3">
                    <MonthCalendar value={formDate} onChange={setFormDate} />
                  </div>
                )}
              </div>}

              {/* repetição */}
              <div className="space-y-3 rounded-2xl bg-card p-4">
                <span className="text-xs font-medium text-muted-foreground">repetição</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFreq("unico")}
                    className={chip(freq === "unico")}
                  >
                    não repete
                  </button>
                  <Button variant="ghost"
                    type="button"
                    onClick={() => {
                      if (freq !== "diario") {
                        setInstallments("");
                        setDaysOfMonth([]);
                      }
                      setFreq("diario");
                      setInfinite(false);
                    }}
                    className={`${chip(freq === "diario")} transition-none`}
                  >
                    diariamente
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setFreq("mensal");
                      if (!infinite) {
                        requestAnimationFrame(() => installmentsRef.current?.focus());
                      }
                    }}
                    className={chip(freq === "mensal")}
                  >
                    mensal
                  </button>
                  <Button variant="ghost"
                    type="button"
                    onClick={() => {
                      if (freq !== "semanal") setInstallments("");
                      setFreq("semanal");
                      setInfinite(false);
                    }}
                    className={`${chip(freq === "semanal")} transition-none`}
                  >
                    semanal
                  </Button>
                </div>

                {freq !== "unico" && (
                  <div className={finiteRepetition ? "mx-auto w-full max-w-48 space-y-1.5 text-center" : "space-y-1.5"}>
                    <label htmlFor="repetition-count" className="text-xs font-medium text-muted-foreground">
                      {freq === "diario" ? "quantas diárias" : freq === "semanal" ? "quantas semanas" : "parcelas"}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        ref={installmentsRef}
                        id="repetition-count"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={!finiteRepetition && infinite ? "" : installments}
                        onFocus={() => {
                          if (infinite) {
                            setInfinite(false);
                            setInstallments("");
                          }
                        }}
                        onChange={(ev) => {
                          setInfinite(false);
                          let next = ev.target.value.replace(/\D/g, "");
                          if (freq === "diario" && next !== "") {
                            const n = Math.min(Number(next), formMonthDays);
                            next = n > 0 ? String(n) : "";
                            const sorted = [...daysOfMonth].sort((a, b) => a - b);
                            if (n > 0 && sorted.length > n) setDaysOfMonth(sorted.slice(0, n));
                          }
                          if (freq === "semanal" && next !== "") {
                            const n = Math.min(Number(next), formWeekLimit);
                            next = n > 0 ? String(n) : "";
                          }
                          setInstallments(next);
                        }}
                        placeholder={freq === "diario" ? "3" : freq === "semanal" ? "2" : "2"}
                        className={`h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 ${finiteRepetition ? "text-center" : infinite ? "opacity-50" : ""}`}
                      />
                      {freq === "mensal" && <Button variant="ghost"
                        type="button"
                        onClick={() => setInfinite((v) => !v)}
                        className={`${chip(infinite)} !h-10 min-w-0 flex-1 !rounded-xl !px-3 !text-sm`}
                      >
                        sem fim
                      </Button>}
                    </div>
                  </div>
                )}

                {freq === "diario" && dailyRepetitionCount(installments) !== null && (
                  <div className="space-y-2">
                    <p className="text-center text-xs font-medium text-muted-foreground">
                      Quais dias? ({daysOfMonth.length}/{installments})
                    </p>
                    <MonthCalendar
                      value={formDate}
                      selected={daysOfMonth
                        .filter((day) => day <= formMonthDays)
                        .map((day) => iso(formDateParts.y, formDateParts.m, day))}
                      onChange={(picked) => {
                        const day = Number(picked.slice(8, 10));
                        const limit = dailyRepetitionCount(installments) ?? 0;
                        if (daysOfMonth.includes(day)) {
                          setDaysOfMonth(daysOfMonth.filter((v) => v !== day));
                        } else if (daysOfMonth.length < limit) {
                          setDaysOfMonth([...daysOfMonth, day]);
                        } else {
                          setError(`Você escolheu ${limit} diária${limit > 1 ? "s" : ""}. Desmarque um dia ou aumente a quantidade.`);
                        }
                      }}
                    />
                  </div>
                )}

              </div>

              {/* tags: ao adicionar e ao editar */}
              {(windowMode === "add" || windowMode === "edit") && (
              <div className="space-y-2 rounded-2xl bg-card p-4">
                <span className="text-xs font-medium text-muted-foreground">tags</span>
                <div className="flex items-center gap-2">
                  <input
                    value={tagInput}
                    maxLength={24}
                    onChange={(ev) => setTagInput(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === ",") {
                        ev.preventDefault();
                        addTag(tagInput);
                      }
                    }}
                    placeholder="ex.: extra, fixo, carro"
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                  />
                  <button type="button" onClick={() => addTag(tagInput)} className={`${chip(false)} !h-10 !w-10 shrink-0 !rounded-xl !px-0 !text-sm`}>
                    ＋
                  </button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                        className={chip(true)}
                        title="remover tag"
                      >
                        {t} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>
              )}

              {error && <p className="px-1 text-sm text-negative">{error}</p>}

              <button
                type="submit"
                className="h-12 w-full rounded-2xl bg-positive px-5 text-base font-semibold text-positive-foreground transition-opacity hover:opacity-90"
              >
                {windowMode === "edit" ? "salvar alterações" : `adicionar ${KINDS.find((k) => k.key === kind)?.title ?? kind}`}
              </button>
            </form>
            )}
          </AddWindow>
          );
        })()}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          toque em um dia para abrir o painel do dia · no + você lança em qualquer coluna e, em
          saídas, pode nomear a dívida, parcelar (12, 48, 360…) ou deixar recorrente sem fim
        </p>

          </>
        )}
      </main>
      </div>
    </div>
  );
}
