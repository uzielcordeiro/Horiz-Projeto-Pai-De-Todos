import { submitOnEnter, submitFormOnEnter } from "@/lib/enter-submit";
import { FitMoney } from "@/components/FitMoney";
import { MoneyInput } from "@/components/MoneyInput";
import { Button } from "@/components/ui/button";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { ProfileBoard } from "@/components/ProfileBoard";
import { supabase } from "@/integrations/supabase/client";
import { LoaderCircle } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AddWindow } from "@/components/AddWindow";
import { MonthCalendar } from "@/components/MonthCalendar";
import { HorizonBoard, type HorizonDay, type HorizonMonth } from "@/components/HorizonBoard";
import { TotalsBoard } from "@/components/TotalsBoard";
import { TagsBoard, type TagRow } from "@/components/TagsBoard";
import { summarizeTags } from "@/lib/tag-summary";
import { SectionBadge, SECTION_KINDS, type SectionKind } from "@/components/SectionBadge";
import { forecastBudgets } from "@/lib/forecast";
import { cents } from "@/lib/money-format";
import { monthItemLabel } from "@/lib/month-item-label";
import { CalendarItemLabel } from "@/components/CalendarItemLabel";
import { HorizonDayList } from "@/components/HorizonDayList";
import { horizonMonthRange, shiftCalendarMonth, shiftHorizonMonth } from "@/lib/calendar-navigation";
import { useCalendarSwipe } from "@/hooks/use-calendar-swipe";

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
  dayBefore,
} from "@/lib/recurrence";

export const Route = createFileRoute("/app")({
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
  component: Index,
});

/** Indicador exibido enquanto a sessão é verificada — nada é renderizado antes. */
function LoadingScreen() {
  return (
    <div
      className="grid min-h-screen place-items-center gap-3 bg-background text-sm text-muted-foreground"
      role="status"
    >
      <LoaderCircle className="size-6 animate-spin" strokeWidth={2} aria-hidden />
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
  /** Economias criadas pelo Futuro funcionam como transferência do saldo. */
  horizonTransfer?: boolean;
};

const FORECAST_ID = "forecast-auto";

const KINDS: { key: Kind; title: string; sign: 1 | -1 | 0 }[] = [
  { key: "entradas", title: "entradas", sign: 1 },
  { key: "saidas", title: "saídas", sign: -1 },
  { key: "diarios", title: "Dia/Dia", sign: -1 },
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
/** no Futuro, R$ 1.000 negativo ou mais ganha o vermelho mais intense (--negative-deep) */
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

/** Linhas da tabela de saldos de um mês qualquer (usado pelos 3 painéis do carrossel). */
function computeMonthRows(entries: Entry[], recurrences: Recurrence[], y: number, m: number) {
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const openingDate = iso(y, m, 1);
  const opening =
    signedTotal(sorted.filter((e) => e.date < openingDate)) +
    recurrences.reduce((s, r) => {
      const sign = balanceSign(r.kind as Kind, r.horizonTransfer);
      return cents(s + sign * sumBefore(r, openingDate));
    }, 0);

  const byDate = new Map<string, Occurrence[]>();
  for (const r of recurrences) {
    for (const o of occurrencesInMonth(r, y, m)) {
      const list = byDate.get(o.date) ?? [];
      list.push(o);
      byDate.set(o.date, list);
    }
  }

  let running = opening;

  const list = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const date = iso(y, m, day);
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
         detail: `${o.recurrenceId === FORECAST_ID ? "Dia/Dia" : (o.name || o.label)}${
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
    const hasIncome = items.some(it => it.kind === "entradas");
    const hasExpense = items.some(
      it => it.kind !== "entradas" && it.kind !== "diarios" && it.kind !== "economias"
    ) || (items.some(it => it.kind === "economias" && it.horizonTransfer));
    const isSaved = items.some(it => it.kind === "economias" && !it.horizonTransfer);
    const dayHasExpense = hasExpense || isSaved;
  return { day, date, totals, balance: running, items, hasIncome, hasExpense: dayHasExpense };
  });

  return { list, opening, closing: running };
}

type MonthRows = ReturnType<typeof computeMonthRows>;

function Index() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const id = data.session?.user.id ?? null;
      if (id) setUserId(id);
      else void navigate({ to: "/login", replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!userId) return <LoadingScreen />;
  return <IndexForUser key={userId} userId={userId} />;
}

function IndexForUser({ userId }: { userId: string }) {
  const today = new Date();
  const tableRef = useRef<HTMLElement>(null);
  const tableHeaderRef = useRef<HTMLDivElement>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [recurrences, setRecurrences] = useState<Recurrence[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  
  const [cursor, setCursor] = useState(() => {
    if (typeof window !== "undefined") {
      const savedY = localStorage.getItem("horiz_cursor_y");
      const savedM = localStorage.getItem("horiz_cursor_m");
      if (savedY && savedM) return { y: Number(savedY), m: Number(savedM) };
    }
    return { y: today.getFullYear(), m: today.getMonth() };
  });
  
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("horiz_cursor_y", String(cursor.y));
      localStorage.setItem("horiz_cursor_m", String(cursor.m));
    }
  }, [cursor]);

  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [windowMode, setWindowMode] = useState<"add" | "month" | "list" | "detail" | "edit" | "info" | "horizon" | "pick">("add");
  const [fromHorizonList, setFromHorizonList] = useState(false);
  const [cameFromPick, setCameFromPick] = useState(false);
  const [activeItemKey, setActiveItemKey] = useState<string | null>(null);
  const [forecastSpent, setForecastSpent] = useState("");
  const [forecastConfirm, setForecastConfirm] = useState(false);
  const [forecastRestoring, setForecastRestoring] = useState(false);
  const [forecastShake, setForecastShake] = useState(0);

  const [view, setView] = useState<"perfil" | "saldos" | "horizonte" | "totais" | "tags" | "menu" | "diario">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("horiz_active_view");
      if (saved) return saved as any;
    }
    return "saldos";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("horiz_active_view", view);
    }
  }, [view]);

  const [horizonStart, setHorizonStart] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const canGoBack = cursor.y * 12 + cursor.m > today.getFullYear() * 12 + today.getMonth();
  const calendarSwipeRef = useCalendarSwipe(shiftMonth, canGoBack, loaded && view === "saldos" && !adding);

  const [forecastItems, setForecastItems] = useState<ForecastItem[]>([]);
  const [forecastDivisor, setForecastDivisor] = useState(30);

  const [kind, setKind] = useState<Kind>("entradas");
  const [windowKind, setWindowKind] = useState<Kind | "saldos">("entradas");
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [formDate, setFormDate] = useState(() =>
    iso(today.getFullYear(), today.getMonth(), today.getDate()),
  );

  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [showCal, setShowCal] = useState(false);

  const [debtName, setDebtName] = useState("");
  const [freq, setFreq] = useState<Freq>("unico");
  const [infinite, setInfinite] = useState(false);
  const [installments, setInstallments] = useState("");
  const installmentsRef = useRef<HTMLInputElement>(null);
  const [daysOfMonth, setDaysOfMonth] = useState<number[]>([]);

  const [history, setHistory] = useState<{ entries: Entry[]; recurrences: Recurrence[] }[]>([]);
  const [editTarget, setEditTarget] = useState<{ type: "entry" | "rec"; id: string } | null>(null);
  const [formOrigin, setFormOrigin] = useState<"standard" | "horizon">("standard");
  const [horizonJump, setHorizonJump] = useState<{
    item: DayItem;
    amount: string;
    ask: null | "save" | "undo";
    error: string | null;
  } | null>(null);
  const [horizonHighlight, setHorizonHighlight] = useState<string | null>(null);

  useLayoutEffect(() => {
    let cancelled = false;
    async function loadFromSupabase() {
      if (!userId) return;

      const [txRes, recRes, castRes, subRes] = await Promise.all([
        supabase.from("transactions").select("*").eq("user_id", userId).order("date", { ascending: false }),
        supabase.from("recurrences").select("payload").eq("user_id", userId),
        supabase.from("forecasts").select("payload").eq("user_id", userId),
        supabase.from("subscriptions").select("status").eq("user_id", userId).maybeSingle()
      ]);

      if (cancelled) return;
      
      if (subRes.data) {
        setSubscriptionStatus(subRes.data.status);
      } else {
        setSubscriptionStatus("none");
      }

      if (txRes.data) {
        const mappedEntries: Entry[] = txRes.data.map((item) => {
          const rawTags = item.marketing_tags ?? [];
          return {
            id: item.id,
            amount: item.amount,
            date: item.date,
            label: item.description || "Lançamento",
            kind: (item.type as Kind) || "entradas",
            tags: rawTags.filter((t: string) => t !== "horizon_transfer"),
            horizonTransfer: rawTags.includes("horizon_transfer"),
          };
        });
        setEntries(mappedEntries);
      }

      if (recRes.data) {
        setRecurrences(recRes.data.map((r) => r.payload as Recurrence));
      }

      if (castRes.data) {
        setForecastItems(castRes.data.map((c) => c.payload as ForecastItem));
      }

      setLoaded(true);
    }
    void loadFromSupabase();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useLayoutEffect(() => {
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
  }, [forecastItems, loaded]);

  async function commit(nextEntries: Entry[], nextRecurrences: Recurrence[], customForecasts?: ForecastItem[]) {
    setHistory((h) => [...h.slice(-19), { entries, recurrences }]);
    setEntries(nextEntries);
    setRecurrences(nextRecurrences);
    
    if (customForecasts) {
      setForecastItems(customForecasts);
    }

    if (!userId) return;

    // Sincronizar transactions (lançamentos únicos) - DIFF LOGIC
    const currentTxIds = new Set(nextEntries.map((e) => e.id));
    const txToRemove = entries.filter((e) => !currentTxIds.has(e.id)).map(e => e.id);
    
    const txUpserts = nextEntries.filter(e => {
      const old = entries.find(o => o.id === e.id);
      if (!old) return true; // novo item
      return old.amount !== e.amount || old.label !== e.label || old.date !== e.date || old.kind !== e.kind || JSON.stringify(old.tags) !== JSON.stringify(e.tags) || old.horizonTransfer !== e.horizonTransfer;
    }).map((e) => {
      const finalTags = e.tags ? [...e.tags] : [];
      if (e.horizonTransfer && !finalTags.includes("horizon_transfer")) finalTags.push("horizon_transfer");
      return {
        id: e.id,
        user_id: userId,
        amount: e.amount,
        type: e.kind,
        date: e.date,
        description: e.label,
        marketing_tags: finalTags,
      };
    });

    if (txToRemove.length > 0) {
      const { error } = await supabase.from("transactions").delete().eq("user_id", userId).in("id", txToRemove);
      if (error) console.error("Erro ao deletar transações:", error);
    }
    if (txUpserts.length > 0) {
      const { error } = await supabase.from("transactions").upsert(txUpserts);
      if (error) console.error("Erro ao upsert transações:", error);
    }

    // Sincronizar recurrences (recorrências e parcelamentos) - DIFF LOGIC
    const currentRecIds = new Set(nextRecurrences.map((r) => r.id));
    const recToRemove = recurrences.filter((r) => !currentRecIds.has(r.id)).map(r => r.id);
    
    const recUpserts = nextRecurrences.filter(r => {
      const old = recurrences.find(o => o.id === r.id);
      if (!old) return true;
      return JSON.stringify(old) !== JSON.stringify(r);
    }).map((r) => ({
      id: r.id,
      user_id: userId,
      payload: r as unknown as object,
    }));

    if (recToRemove.length > 0) {
      const { error } = await supabase.from("recurrences").delete().eq("user_id", userId).in("id", recToRemove);
      if (error) console.error("Erro ao deletar recorrências:", error);
    }
    if (recUpserts.length > 0) {
      const { error } = await supabase.from("recurrences").upsert(recUpserts);
      if (error) console.error("Erro ao upsert recorrências:", error);
    }
    
    // Sincronizar forecasts se passado no parâmetro - DIFF LOGIC
    if (customForecasts) {
       const currentCastIds = new Set(customForecasts.map((c) => c.id));
       const castToRemove = forecastItems.filter((c) => !currentCastIds.has(c.id)).map(c => c.id);
       
       const castUpserts = customForecasts.filter(c => {
         const old = forecastItems.find(o => o.id === c.id);
         if (!old) return true;
         return JSON.stringify(old) !== JSON.stringify(c);
       }).map((c) => ({
         id: c.id,
         user_id: userId,
         payload: c as unknown as object,
       }));

       if (castToRemove.length > 0) {
         const { error } = await supabase.from("forecasts").delete().eq("user_id", userId).in("id", castToRemove);
         if (error) console.error("Erro ao deletar previsões:", error);
       }
       if (castUpserts.length > 0) {
         const { error } = await supabase.from("forecasts").upsert(castUpserts);
         if (error) console.error("Erro ao upsert previsões:", error);
       }
    }
  }

  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();

  const rows = useMemo(
    () => computeMonthRows(entries, recurrences, cursor.y, cursor.m),
    [entries, recurrences, cursor],
  );

  const prevCursor = shiftCalendarMonth(cursor, -1);
  const nextCursor = shiftCalendarMonth(cursor, 1);
  const prevRows = useMemo(
    () => computeMonthRows(entries, recurrences, prevCursor.y, prevCursor.m),
    [entries, recurrences, prevCursor.y, prevCursor.m],
  );
  const nextRows = useMemo(
    () => computeMonthRows(entries, recurrences, nextCursor.y, nextCursor.m),
    [entries, recurrences, nextCursor.y, nextCursor.m],
  );

  const monthTotals = useMemo(() => {
    const t = {} as Record<Kind, number>;
    for (const k of KINDS) t[k.key] = rows.list.reduce((s, r) => cents(s + r.totals[k.key]), 0);
    return t;
  }, [rows]);

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

  const totalsItems = useMemo(() => {
    const map = {} as Record<Kind, DayItem[]>;
    for (const k of KINDS) map[k.key] = [];
    for (const r of rows.list) {
      for (const it of r.items) map[it.kind]?.push(it);
    }
    return map;
  }, [rows]);

  const totalsMonthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const tagRows = useMemo<TagRow[]>(() => {
    const untilEnd = iso(cursor.y, cursor.m, new Date(cursor.y, cursor.m + 1, 0).getDate());
    return summarizeTags(entries, recurrences, untilEnd);
  }, [entries, recurrences, cursor]);

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
    const nextEntries = entries.map(apply);
    const nextRecurrences = recurrences.map(apply);
    void commit(nextEntries, nextRecurrences);
    setTags((prev) => swap(prev));
  }

  function deleteTag(tag: string) {
    const strip = <T extends { tags?: string[] }>(x: T): T =>
      x.tags?.includes(tag) ? { ...x, tags: x.tags.filter((t) => t !== tag) } : x;
    const nextEntries = entries.map(strip);
    const nextRecurrences = recurrences.map(strip);
    void commit(nextEntries, nextRecurrences);
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  const horizonMonths = useMemo<HorizonMonth[]>(() => {
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const range = horizonMonthRange(horizonStart);
    if (range.length === 0) return [];
    const first = iso(range[0]!.y, range[0]!.m, 1);

    let opening = 0;
    const byDate = new Map<string, number>();

    // PASSO 1: Preparar as listas de presença (Set) para busca instantânea de setas
    const incomeDays = new Set<string>();
    const expenseDays = new Set<string>();

    // Mapeia os lançamentos únicos
    for (const e of sorted) {
      const sign = balanceSign(e.kind, e.horizonTransfer);
      if (e.date < first) {
        opening = cents(opening + sign * e.amount);
      } else {
        const k = KINDS.find((x) => x.key === e.kind);
        if (k) byDate.set(e.date, cents((byDate.get(e.date) ?? 0) + sign * e.amount));
      }
      
      // Etiqueta se o dia teve entrada ou saída para as setas visuais
      if (e.kind === "entradas") incomeDays.add(e.date);
      else if (e.kind !== "entradas" && e.kind !== "diarios") expenseDays.add(e.date);
    }

    // Mapeia as ocorrências (repetições)
    for (const r of recurrences) {
      const k = KINDS.find((x) => x.key === r.kind);
      if (!k) continue;
      
      const sign = balanceSign(r.kind as Kind, r.horizonTransfer);
      opening = cents(opening + sign * sumBefore(r, first));
      
      for (const { y, m } of range) {
        for (const o of occurrencesInMonth(r, y, m)) {
          byDate.set(
            o.date,
            cents((byDate.get(o.date) ?? 0) + balanceSign(o.kind as Kind, o.horizonTransfer) * o.amount),
          );
          
          // Etiqueta se a repetição no dia gera entrada ou saída
          if (o.kind === "entradas") incomeDays.add(o.date);
          else if (o.kind !== "entradas" && o.kind !== "diarios") expenseDays.add(o.date);
        }
      }
    }

    const out: HorizonMonth[] = [];
    let running = opening;

    // PASSO 2: Montar os meses da Projeção sem fazer loops e recálculos repetidos
    for (const { y, m } of range) {
      const total = new Date(y, m + 1, 0).getDate();
      
      const days = Array.from({ length: total }, (_, idx) => {
        const day = idx + 1;
        const date = iso(y, m, day);
        running = cents(running + (byDate.get(date) ?? 0));

        // PASSO 3: Apenas pergunta à lista de presença se tem seta (Custo zero de memória)
        const hasIncome = incomeDays.has(date);
        const hasExpense = expenseDays.has(date);
        
        return { day, date, balance: running, status: horizonStatusOf(running), hasIncome, hasExpense };
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
    resetForm();
    setAdding(false);
    setCursor((c) => shiftCalendarMonth(c, delta));
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

  function renderDayRow(row: MonthRows["list"][number], interactive: boolean) {
    const s = statusOf(row.balance);
    const open = interactive && selectedDay === row.day;
    const today = interactive && isToday(row.day);
    const cells = (
      <>
        <span
          className={`grid size-8 place-items-center rounded-lg text-sm font-semibold ${
            today ? "bg-primary text-primary-foreground" : "text-muted-foreground"
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
      </>
    );
    const gridClass = `grid w-full ${GRID} items-stretch px-3 py-3.5 text-left transition-colors ${
      open ? "bg-accent/60" : ""
    } ${today ? "border-b-2 border-foreground" : ""}`;
    if (!interactive) {
      return (
        <div key={row.date}>
          <div className={gridClass}>{cells}</div>
        </div>
      );
    }
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
            if (!clickedKind) return;
            const openingKind = clickedKind;
            const categoryItems = row.items.filter(
              (item) => item.recurrenceId !== FORECAST_ID && item.kind === openingKind,
            );
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
          className={`${gridClass} hover:bg-accent/50`}
        >
          {cells}
        </button>
      </div>
    );
  }

  function renderMonthPanel(monthRows: MonthRows, interactive: boolean) {
    const totals = {} as Record<Kind, number>;
    for (const k of KINDS)
      totals[k.key] = monthRows.list.reduce((s, r) => cents(s + r.totals[k.key]), 0);
    const closing = statusOf(monthRows.closing);
    return (
      <div
        key={interactive ? "atual" : (monthRows.list[0]?.date ?? "vizinho")}
        className={`w-1/3 shrink-0 ${interactive ? "" : "pointer-events-none select-none"}`}
        aria-hidden={!interactive}
      >
        <section
          ref={interactive ? tableRef : undefined}
          className="min-w-0 touch-pan-y overflow-x-auto rounded-b-2xl border border-border bg-card"
          onScroll={
            interactive
              ? (event) => {
                  if (
                    tableHeaderRef.current &&
                    tableHeaderRef.current.scrollLeft !== event.currentTarget.scrollLeft
                  ) {
                    tableHeaderRef.current.scrollLeft = event.currentTarget.scrollLeft;
                  }
                }
              : undefined
          }
        >
          <div className="min-w-[760px]">
            <div className="divide-y divide-border">
              {monthRows.list.map((row) => renderDayRow(row, interactive))}
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
                  <FitMoney value={totals[k.key]} />
                </span>
              ))}
              <span
                data-fit
                className="flex min-w-0 items-center justify-end overflow-hidden border-l border-border/70 px-2"
              >
                <span
                  className={`min-w-0 rounded-lg px-2.5 py-1 text-right tabular-nums ${saldoCell[closing]}`}
                >
                  <FitMoney value={monthRows.closing} />
                </span>
              </span>
            </div>
          </div>
        </section>
      </div>
    );
  }

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

  const formDateParts = useMemo(() => {
    const p = formDate.split("-").map(Number);
    return { y: p[0] ?? today.getFullYear(), m: (p[1] ?? 1) - 1, d: p[2] ?? 1 };
  }, [formDate]);
  const formMonthDays = new Date(formDateParts.y, formDateParts.m + 1, 0).getDate();
  const formWeekLimit = weeklyRepetitionLimit(formDate);
  const finiteRepetition = freq === "diario" || freq === "semanal";

  async function saveEntry(e: React.FormEvent) {
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
          await commit(entries.filter((en) => en.id !== editTarget.id), [
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
          await commit(
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
        await commit(
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
        await commit(
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
      await commit(entries, [
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
    await commit(
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

  async function deleteItems(items: DayItem[]) {
    if (items.length === 0) return;
    const entryIds = new Set(items.filter((i) => i.entryId).map((i) => i.entryId!));
    const skips = items.filter((i) => i.recurrenceId);
    if (skips.some((s) => s.recurrenceId === FORECAST_ID)) {
      await commit(
        entries.filter((e) => !entryIds.has(e.id)),
        recurrences.filter((r) => r.id !== FORECAST_ID),
        []
      );
      return;
    }
    await commit(
      entries.filter((e) => !entryIds.has(e.id)),
      recurrences.map((r) => {
        const dates = skips.filter((s) => s.recurrenceId === r.id).map((s) => s.date);
        return dates.length ? { ...r, skipped: [...r.skipped, ...dates] } : r;
      }),
    );
  }

  async function removeEntry(id: string) {
    await commit(
      entries.filter((e) => e.id !== id),
      recurrences,
    );
  }

  async function updateEntryAmount(id: string, value: number) {
    await commit(
      entries.map((e) => (e.id === id ? { ...e, amount: value } : e)),
      recurrences,
    );
  }

  async function updateRecurrenceAmount(recurrenceId: string, value: number) {
    await commit(
      entries,
      recurrences.map((r) => (r.id === recurrenceId ? { ...r, amount: value } : r)),
    );
  }

  async function setForecastDay(date: string, value: number | null | undefined) {
    await commit(
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

  async function skipOccurrence(recurrenceId: string, date: string) {
    await commit(
      entries,
      recurrences.map((r) =>
        r.id === recurrenceId ? { ...r, skipped: [...r.skipped, date] } : r,
      ),
    );
  }

  async function endRecurrenceFrom(recurrenceId: string, date: string) {
    const end = dayBefore(date);
    await commit(
      entries,
      recurrences.flatMap((r) =>
        r.id !== recurrenceId ? [r] : end < r.startDate ? [] : [{ ...r, endDate: end }],
      ),
    );
  }

  async function removeRecurrence(recurrenceId: string) {
    await commit(
      entries,
      recurrences.filter((r) => r.id !== recurrenceId),
      recurrenceId === FORECAST_ID ? [] : undefined
    );
  }

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

  async function applyHorizonJump(action: "save" | "undo", scope: "day" | "all") {
    if (!horizonJump) return;
    const { item } = horizonJump;
    const value = action === "undo" ? 0 : parseAmount(horizonJump.amount);
    if (!Number.isFinite(value) || value < 0) {
      setHorizonJump({ ...horizonJump, ask: null, error: "Informe um valor válido." });
      return;
    }
    const remove = value === 0;
    if (item.entryId) {
      if (remove) await removeEntry(item.entryId);
      else await updateEntryAmount(item.entryId, value);
    } else if (item.recurrenceId) {
      const r = recurrences.find((x) => x.id === item.recurrenceId);
      if (!r) return;
      if (scope === "all") {
        if (remove) await removeRecurrence(r.id);
        else await updateRecurrenceAmount(r.id, value);
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
        await commit(nextEntries, nextRecs);
      }
    }
    setHorizonJump(null);
  }

  async function deleteAll() {
    await commit([], [], []);
  }

  async function clearRange(startIso: string, endIso: string, months: { y: number; m: number }[]) {
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
    await commit(
      entries.filter((e) => e.date < startIso || e.date > endIso),
      recurrences.map((r) => {
        const dates = skipByRec.get(r.id);
        return dates ? { ...r, skipped: [...r.skipped, ...dates] } : r;
      }),
    );
  }

  async function clearMonth() {
    const last = new Date(cursor.y, cursor.m + 1, 0).getDate();
    await clearRange(iso(cursor.y, cursor.m, 1), iso(cursor.y, cursor.m, last), [
      { y: cursor.y, m: cursor.m },
    ]);
  }

  function resetCalendar(scope: "month" | "all") {
    const snapshot = { entries, recurrences, forecastItems, history };
    if (scope === "month") {
      void clearMonth();
    } else {
      void deleteAll();
      setHistory([]);
    }
    return () => {
      setEntries(snapshot.entries);
      setRecurrences(snapshot.recurrences);
      setForecastItems(snapshot.forecastItems);
      setHistory(snapshot.history);
    };
  }

  const isToday = (day: number) =>
    cursor.y === today.getFullYear() && cursor.m === today.getMonth() && day === today.getDate();

  const chip = (active: boolean) =>
    `h-8 min-w-8 rounded-lg border px-2 text-xs font-medium transition-colors ${
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-input bg-background text-muted-foreground hover:bg-accent"
    }`;

  const navBtn =
    "grid size-9 shrink-0 place-items-center rounded-full border-[1.5px] border-foreground/30 text-lg font-bold leading-none text-foreground transition-colors hover:bg-accent disabled:text-foreground/50 disabled:opacity-100";

  const isHorizon = view === "horizonte";
  const isSaldos = view === "saldos" && !adding;

  if (!loaded) return <LoadingScreen />;

  if (subscriptionStatus === "none" || subscriptionStatus === null || subscriptionStatus === "inactive") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-full bg-primary/10">
            <span aria-hidden className="font-display text-2xl font-bold text-primary">H</span>
          </div>
          <h1 className="mb-3 font-display text-2xl font-semibold text-foreground">Você ainda não é assinante</h1>
          <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
            Escolha o plano ideal para a sua jornada e tenha acesso completo ao painel de saldos e calendário do Horiz.
          </p>
          <div className="space-y-3">
            <Button
              onClick={() => {
                window.location.href = "https://horizapp.com";
              }}
              className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Escolher Plano
            </Button>
            <Button
              variant="ghost"
              onClick={() => supabase.auth.signOut()}
              className="h-12 w-full rounded-xl text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Sair da conta
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (subscriptionStatus !== "active" && subscriptionStatus !== "trialing") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-full bg-negative/10">
            <span aria-hidden className="font-display text-2xl font-bold text-negative">!</span>
          </div>
          <h1 className="mb-3 font-display text-2xl font-semibold text-foreground">Acesso Suspenso</h1>
          <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
            Identificamos uma pendência no seu último pagamento ou sua assinatura expirou. Atualize sua forma de pagamento no nosso portal para liberar o seu calendário e continuar gerenciando o seu futuro.
          </p>
          <div className="space-y-3">
            <Button
              onClick={() => {
                window.location.href = "https://billing.stripe.com/p/login/test_3cI3cwdSu3nv4mxgdybQY00";
              }}
              className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Atualizar Pagamento
            </Button>
            <Button
              variant="ghost"
              onClick={() => supabase.auth.signOut()}
              className="h-12 w-full rounded-xl text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Sair da conta
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar
        onReset={resetCalendar}
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
          setCameFromPick(false);
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
          } else if (key === "perfil" || key === "totais" || key === "tags") {
            setView(key);
          } else {
            setView("saldos");
          }
        }}
      />

      <div className={isHorizon ? "flex h-screen min-w-0 flex-1 flex-col overflow-hidden" : "min-w-0 flex-1"}>
        <header className="calendar-header sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
          <div className={`calendar-header-inner relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 ${isHorizon || isSaldos ? "px-3 py-1.5 sm:px-4" : "px-5 py-3 sm:px-8"}`}>
            <div className="flex min-w-0 items-center gap-3">
              {(view === "diario" || view === "menu") && (
                <button
                  type="button"
                  onClick={() => setView("saldos")}
                  aria-label="voltar"
                  className="grid size-9 shrink-0 place-items-center rounded-full border border-border text-foreground transition-colors hover:bg-accent"
                >
                  ←
                </button>
              )}
              <h1 className={`truncate font-display font-semibold text-foreground ${isHorizon ? "text-lg" : "text-xl sm:text-2xl"}`}>
                {view === "perfil"
                  ? "Conta"
                  : view === "saldos"
                  ? "Calendário"
                  : view === "horizonte"
                  ? "Projeção"
                  : view === "totais"
                  ? "Resumo"
                  : view === "tags"
                  ? "Tags"
                  : view === "diario" || view === "menu"
                  ? "Hoje"
                  : "Calendário"}
              </h1>
              <ThemeToggle />
            </div>
            {isHorizon && (
              <div
                aria-label="Legenda dos marcadores do Futuro"
                className="horizon-header-legend pointer-events-none absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center gap-6 text-xs text-muted-foreground sm:gap-8"
              >
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span aria-hidden className="horizon-reminder horizon-reminder-negative" />
                  Dia da maior dívida
                </span>
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span aria-hidden className="horizon-reminder horizon-reminder-positive" />
                  Dia do maior saldo
                </span>
              </div>
            )}
            <div className={`calendar-date-controls flex shrink-0 items-center gap-2 ${view === "perfil" || view === "horizonte" || view === "menu" || view === "diario" ? "hidden" : ""}`}>
              <Button variant="ghost" size="icon" disabled={!canGoBack} onClick={() => shiftMonth(-12)} aria-label="Ano anterior" className={navBtn}>
                «
              </Button>
              <Button variant="ghost" size="icon" disabled={!canGoBack} onClick={() => shiftMonth(-1)} aria-label="Mês anterior" className={navBtn}>
                ‹
              </Button>
              <span className="min-w-44 rounded-full border-[1.5px] border-foreground/30 px-4 py-1.5 text-center text-sm font-medium capitalize text-foreground">
                {monthLabel(cursor.y, cursor.m)}
              </span>
              <Button variant="ghost" size="icon" onClick={() => shiftMonth(1)} aria-label="Próximo mês" className={navBtn}>
                ›
              </Button>
              <Button variant="ghost" size="icon" onClick={() => shiftMonth(12)} aria-label="Próximo ano" className={navBtn}>
                »
              </Button>
              <Button
                variant="ghost"
                onClick={goToday}
                className="ml-1 h-9 rounded-full border-[1.5px] border-foreground/30 bg-accent/60 px-3 text-xs font-bold text-foreground transition-colors hover:bg-accent"
              >
                hoje
              </Button>
            </div>
          </div>
        </header>

      <main className={isHorizon ? "flex min-h-0 w-full flex-1 flex-col px-2 py-2 sm:px-3" : isSaldos ? "w-full space-y-4 px-2 py-2 sm:px-3" : "w-full space-y-6 px-5 py-6 sm:px-8"}>
        {view === "perfil" && !adding ? (
          <ProfileBoard />
        ) : view === "horizonte" ? (
          <>
          {horizonJump && (() => {
            const j = horizonJump;
            const isRec = !!j.item.recurrenceId;
            const run = (action: "save" | "undo") => {
              if (isRec) setHorizonJump({ ...j, ask: action, error: null });
              else void applyHorizonJump(action, "day");
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
                        onClick={() => void applyHorizonJump(j.ask!, "day")}
                        className="h-11 w-full rounded-xl bg-primary/10 text-sm font-semibold text-primary hover:bg-primary/20"
                      >
                        só este dia
                      </button>
                      <button
                        type="button"
                        onClick={() => void applyHorizonJump(j.ask!, "all")}
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
              onToday={() => {
                const now = new Date();
                setHorizonHighlight(null);
                setHorizonStart({ y: now.getFullYear(), m: now.getMonth() });
              }}
              onShift={(delta) =>
                setHorizonStart((h) => shiftHorizonMonth(h, delta))
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
                setCameFromPick(false);
                setActiveItemKey(null);
                setFromHorizonList(false);
                setWindowMode("horizon");
                setAdding(true);
              }}
            />
          </>
        ) : view === "totais" ? (
          <TotalsBoard data={totalsData} items={totalsItems} monthLabel={totalsMonthLabel} />
        ) : (view === "diario" || view === "menu") && !adding ? (
          <DailyForecastBoard
            items={forecastItems}
            year={today.getFullYear()}
            month={today.getMonth()}
            onSave={(item) => {
              const customForecasts = forecastItems.some((p) => p.id === item.id)
                ? forecastItems.map((p) => (p.id === item.id ? item : p))
                : [...forecastItems, item];
              void commit(entries, recurrences, customForecasts);
            }}
            onDelete={(id) => {
               const customForecasts = forecastItems.filter((p) => p.id !== id);
               void commit(entries, recurrences, customForecasts);
            }}
          />
        ) : view === "tags" ? (
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
              setSelectedDay(day);
              setFormDate(iso(cursor.y, cursor.m, day));
              setKind("entradas");
              setWindowKind("entradas");
              setEditTarget(null);
              setFormOrigin("standard");
              setCameFromPick(false);
              setActiveItemKey(null);
              setWindowMode("pick");
              setAdding(true);
            }}
          />
        ) : (
          <>
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="raise-soft rounded-2xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">saldo anterior</p>
            <p className="mt-1 text-lg font-semibold text-foreground"><FitMoney value={rows.opening} /></p>
          </div>
          <div className="raise-soft rounded-2xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">entradas do mês</p>
            <p className="mt-1 text-lg font-semibold text-positive"><FitMoney value={monthTotals.entradas} /></p>
          </div>
          <div className="raise-soft rounded-2xl border border-border bg-card p-4">
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

        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 overflow-x-clip">
          <div className={`sticky z-20 overflow-hidden rounded-t-2xl border border-b-0 border-border bg-secondary ${isSaldos ? "top-[49px]" : "top-[61px]"}`}>
            <div
              ref={tableHeaderRef}
              data-calendar-columns
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
                 Saldos
              </span>
            </div>
            </div>
          </div>

          <div ref={calendarSwipeRef} className="-ml-[100%] flex w-[300%] touch-pan-y">
            {renderMonthPanel(prevRows, false)}
            {renderMonthPanel(rows, true)}
            {renderMonthPanel(nextRows, false)}
          </div>
        </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          toque em um dia para abrir o painel do dia · no + você lança em qualquer coluna e, em
          saídas, pode nomear a dívida, parcelar (12, 48, 360…) ou deixar recorrente sem fim
        </p>
          </>
        )}

        {adding && (() => {
          const windowDayRow =
            formDateParts.y === cursor.y && formDateParts.m === cursor.m
              ? rows.list[formDateParts.d - 1] ?? null
              : null;
          const windowDayItems = (windowDayRow?.items ?? []).filter(
            (it) => it.recurrenceId !== FORECAST_ID && it.kind === windowKind,
          );
          const monthPrefix = iso(formDateParts.y, formDateParts.m, 1).slice(0, 7);
          const horizonDayItems = windowDayRow?.items ?? [];
  const activeItem = (windowDayItems.find((item) => item.key === activeItemKey) ?? horizonDayItems.find((item) => item.key === activeItemKey)) ?? null;
          const horizonPicking = windowMode === "pick" || (windowMode === "horizon" && horizonDayItems.length === 0);
          const pickKind = (k: Kind) => {
            resetForm();
            setError(null);
            setShowCal(false);
            setEditTarget(null);
            setActiveItemKey(null);
            setKind(k);
            setWindowKind(k);
            setFormOrigin(k === "economias" ? "horizon" : "standard");
            setCameFromPick(true);
            setWindowMode(k === "diarios" ? "info" : "add");
          };
          const selectHorizonItem = (key: string) => {
            const item = horizonDayItems.find((it) => it.key === key);
            if (!item) return;
            setFromHorizonList(true);
            setWindowKind(item.kind);
           if (item.recurrenceId === FORECAST_ID) {
      setKind("diarios");
      setFormOrigin("horizon");
    }
            setActiveItemKey(item.key);
            setWindowMode("detail");
          };
          const closeWindow = () => {
            setAdding(false);
            setCameFromPick(false);
            setFromHorizonList(false);
            setForecastRestoring(false);
            setError(null);
            setShowCal(false);
            setActiveItemKey(null);
            resetForm();
          };
          const detailDeleteActions = activeItem
            ? activeItem.recurrenceId
              ? [
                  {
                    key: "occurrence",
                    label: "apagar só este lançamento",
                    onSelect: () => {
                      void skipOccurrence(activeItem.recurrenceId ?? "", activeItem.date);
                      closeWindow();
                    },
                  },
                  {
                    key: "future",
                    label: "apagar desta data em diante",
                    tone: "warning" as const,
                    onSelect: () => {
                      void endRecurrenceFrom(activeItem.recurrenceId ?? "", activeItem.date);
                      closeWindow();
                    },
                  },
                  {
                    key: "recurrence",
                    label: "apagar recorrência inteira",
                    onSelect: () => {
                      void removeRecurrence(activeItem.recurrenceId ?? "");
                      closeWindow();
                    },
                  },
                ]
              : [
                  {
                    key: "entry",
                    label: "apagar lançamento",
                    onSelect: () => {
                      void deleteItems([activeItem]);
                      closeWindow();
                    },
                  },
                ]
            : undefined;
         const horizonAddWindow =
            windowMode === "horizon" ||
            windowMode === "pick" ||
            (windowMode === "add" &&
            ((windowKind === "economias" && formOrigin === "horizon") ||
              windowKind === "entradas" ||
              windowKind === "saidas" ||
              windowKind === "cartao"));

          const isMonthListKind = windowKind === "entradas" || windowKind === "saidas" || windowKind === "cartao";
         const showBackBtn = (windowMode === "add" || windowMode === "detail" || windowMode === "edit") && (windowDayItems.length > 0 || horizonDayItems.length > 0) && !cameFromPick;

          return (
          <AddWindow
            hideClose={showBackBtn || ((windowMode === "add" || windowMode === "info") && cameFromPick)}
            headerAction={
              (windowMode === "add" || windowMode === "info") && cameFromPick ? (
                <Button
                  type="button"
                  onClick={() => setWindowMode("pick")}
                  aria-label="voltar"
                  title="voltar"
                  className="h-9 shrink-0 gap-1 rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground shadow hover:bg-primary/90"
                >
                  <span aria-hidden className="w-4 shrink-0 text-center">‹</span>
                  <span>voltar</span>
                </Button>
              ) : windowMode === "horizon" && !horizonPicking ? (
                 <Button
                  type="button"
                  onClick={() => setWindowMode("pick")}
                  aria-label="adicionar"
                  title="adicionar"
                   className="h-9 shrink-0 gap-1 rounded-xl bg-positive px-2 text-xs font-semibold text-positive-foreground hover:bg-positive/90"
                >
                   <span className="w-4 shrink-0 text-center">＋</span>
                  <span>adicionar</span>
                 </Button>
              ) : (windowMode === "month" || windowMode === "list") && isMonthListKind ? (
                 <Button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setError(null);
                    setShowCal(false);
                    setWindowMode("add");
                  }}
                  aria-label="adicionar"
                  title="adicionar"
                  className="h-9 shrink-0 gap-1 rounded-xl bg-positive px-2 text-xs font-semibold text-positive-foreground shadow hover:bg-positive/90"
                 >
                   <span className="w-4 shrink-0 text-center">＋</span>
                   <span>adicionar</span>
                 </Button>
              ) : showBackBtn ? (
                 <Button
                  type="button"
                  onClick={() => {
                    if (windowMode === "edit" && activeItemKey) {
              setWindowMode("detail");
            } else if (view === "horizonte" && fromHorizonList) {
              setWindowKind("economias");
              setFormOrigin("horizon");
              setCameFromPick(false);
              setFromHorizonList(false);
              setWindowMode("horizon");
            } else {
              setWindowMode(isMonthListKind ? "month" : "list");
            }
                  }}
                  aria-label="voltar"
                  title="voltar"
                  className="h-9 shrink-0 gap-1 rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground shadow hover:bg-primary/90"
                 >
                   <span aria-hidden className="w-4 shrink-0 text-center">‹</span>
                   <span>voltar</span>
                 </Button>
              ) : undefined
            }
            title={
              horizonPicking
                ? "adicionar"
                : windowMode === "horizon"
                ? "lançamentos"
                : 
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
                          (windowKind === "saldos" ? "saldos" : "Dia/Dia"))
                      : "detalhes"
            }
            subtitle={
               horizonAddWindow && !(windowMode === "horizon" && !horizonPicking)
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
               horizonAddWindow && !(windowMode === "horizon" && !horizonPicking)
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

            {horizonPicking && (
              <div className="space-y-2">
                {KINDS.map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    onClick={() => pickKind(k.key)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-card p-4 text-left transition-colors hover:bg-accent"
                  >
                    <span className={`text-sm font-semibold ${kindTone[k.key]}`}>{k.title}</span>
                    <span aria-hidden className="text-muted-foreground">›</span>
                  </button>
                ))}
              </div>
            )}

            {windowMode === "horizon" && !horizonPicking && (
              <HorizonDayList
                items={horizonDayItems}
                 onSelect={(item) => selectHorizonItem(item.key)}
              />
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
                      a aba lateral da{" "}
                      <span className="font-bold tracking-wide text-primary">Projeção</span>
                    </>
                  ) : (
                    <>
                      o{" "}
                      <span className="font-bold tracking-wide text-primary">Dia/Dia</span>
                    </>
                  )}
                  .
                </p>

                {windowKind === "diarios" && (
                  <button
                    type="button"
                    onClick={() => {
                      closeWindow();
                      setView("diario");
                    }}
                    className="mt-4 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
                  >
                    ir para o Dia/Dia
                    <span aria-hidden>›</span>
                  </button>
                )}

                {windowKind === "economias" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeItem?.horizonTransfer) {
                        jumpToHorizon(activeItem);
                      } else {
                        closeWindow();
                        setView("horizonte");
                      }
                    }}
                    className="mt-4 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
                  >
                    ir para a Projeção
                    <span aria-hidden>›</span>
                  </button>
                )}

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
                          void setForecastDay(formDate, v);
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
                              <div className="flex gap-2" onKeyDown={submitOnEnter(save)}>
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
                            void setForecastDay(formDate, undefined);
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
                                void setForecastDay(formDate, null);
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
                      aria-label="Ir para a seção da Projeção"
                      className="block w-full rounded-2xl border border-primary/30 bg-card p-4 text-left transition-colors"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-muted-foreground">origem</span>
                        <span className="inline-flex h-8 items-center gap-1 rounded-lg border border-primary/40 bg-primary/15 px-3 text-sm font-semibold text-primary">
                          ir para a seção da Projeção
                          <span aria-hidden>›</span>
                        </span>
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-foreground">
                        {`Poupado da Projeção em ${longDate(activeItem.date)}`}
                      </span>
                      <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">
                        Para adicionar ou retirar novos valores, use a aba lateral da Projeção.
                      </span>
                    </button>
                  ) : (
                  <div className="rounded-2xl bg-card p-4">
                    <p className="text-xs font-medium text-muted-foreground">origem</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {`Lançado em ${longDate(activeItem.date)}`}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      Para adicionar ou retirar novos valores, use a aba lateral da Projeção.
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
            <form onSubmit={(e) => void saveEntry(e)} onKeyDown={submitFormOnEnter} className="space-y-3">
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

              {(windowMode === "add" || windowMode === "edit") && (
              <div className="space-y-2 rounded-2xl bg-card p-4">
                <span className="text-xs font-medium text-muted-foreground">tags</span>
                <div className="flex items-center gap-2">
                  <input
                    value={tagInput}
                    maxLength={24}
                    onChange={(ev) => setTagInput(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === ",") {
                        ev.preventDefault();
                        addTag(tagInput);
                      }
                    }}
                    placeholder="ex.: extra, fixo, carro"
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                  />
                  <button type="button" tabIndex={-1} aria-label="adicionar tag" onClick={() => addTag(tagInput)} className={`${chip(false)} !h-10 !w-10 shrink-0 !rounded-xl !px-0 !text-sm`}>
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
      </main>
      </div>
    </div>
  );
}
