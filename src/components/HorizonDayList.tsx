import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FitMoney } from "@/components/FitMoney";
import { SectionBadge, type SectionKind } from "@/components/SectionBadge";
import type { Recurrence } from "@/lib/recurrence";

export type HorizonListItem = {
  key: string;
  kind: SectionKind;
  title: string;
  amount: number;
  detail: string;
  date: string;
  tags?: string[];
  recurrenceId?: string;
  entryId?: string;
  horizonTransfer?: boolean;
};

type Props = {
  items: HorizonListItem[];
  recurrences: Recurrence[];
  onEdit: (item: HorizonListItem) => void;
  onDelete: (item: HorizonListItem, scope: "day" | "future" | "all") => void;
};

const dateLabel = (date: string) => new Date(date + "T12:00:00").toLocaleDateString("pt-BR");
const frequency = { monthly: "mensal", weekly: "semanal", daily: "diariamente" };
const weekdays = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function HorizonDayList({ items, recurrences, onEdit, onDelete }: Props) {
  const [deleting, setDeleting] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const rec = recurrences.find((r) => r.id === item.recurrenceId);
        const automatic = rec?.id === "forecast-auto";
        return (
          <div key={item.key} className="space-y-3 rounded-xl bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><SectionBadge kind={item.kind} compact />{item.title}</span>
                <p className="break-words text-sm font-semibold text-foreground">{item.detail}</p>
              </div>
              <span className={`shrink-0 text-sm font-bold tabular-nums ${item.kind === "entradas" ? "text-positive" : item.kind === "economias" ? "text-foreground" : "text-negative"}`}><FitMoney value={item.amount} /></span>
            </div>
            <dl className="space-y-1 break-words text-xs text-muted-foreground">
              <div>data: <span className="text-foreground">{dateLabel(item.date)}</span></div>
              {rec ? <>
                <div>identificação: <span className="text-foreground">{rec.label}</span></div>
                {rec.name && rec.name !== rec.label && <div>nome: <span className="text-foreground">{rec.name}</span></div>}
                <div>repetição: <span className="text-foreground">{frequency[rec.freq]}</span></div>
                <div>parcelas: <span className="text-foreground">{rec.installments ?? "sem fim"}</span></div>
                <div>início: <span className="text-foreground">{dateLabel(rec.startDate)}</span></div>
                {rec.endDate && <div>fim: <span className="text-foreground">{dateLabel(rec.endDate)}</span></div>}
                {rec.daysOfMonth.length > 0 && <div>dias: <span className="text-foreground">{rec.daysOfMonth.join(", ")}</span></div>}
                {rec.daysOfWeek.length > 0 && <div>dias: <span className="text-foreground">{rec.daysOfWeek.map((day) => weekdays[day]).join(", ")}</span></div>}
                {rec.monthlyBudget != null && <div>previsão mensal: <FitMoney value={rec.monthlyBudget} /></div>}
                {rec.weeklyBudget != null && <div>previsão semanal: <FitMoney value={rec.weeklyBudget} /></div>}
              </> : <div>repetição: <span className="text-foreground">não repete</span></div>}
              {item.horizonTransfer && <div>origem: <span className="text-foreground">poupado do Horizonte</span></div>}
              <div>tags: <span className="text-foreground">{item.tags?.join(", ") || "—"}</span></div>
            </dl>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => onEdit(item)} className="h-8 rounded-lg border border-primary/40 bg-primary/10 px-2.5 text-xs font-semibold text-primary hover:bg-primary/20">editar</Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleting(deleting === item.key ? null : item.key)} className="h-8 rounded-lg border border-negative/40 bg-negative/10 px-2.5 text-xs font-semibold text-negative hover:bg-negative/20">apagar</Button>
            </div>
            {deleting === item.key && <div className="space-y-1 border-t border-border pt-2">
              <p className="text-xs text-muted-foreground">tem certeza?</p>
              {(rec && !automatic ? ["day", "future", "all"] as const : ["day"] as const).map((scope) => <Button key={scope} variant="ghost" size="sm" className="h-auto w-full justify-start whitespace-normal rounded-xl text-xs text-negative hover:bg-negative/10" onClick={() => { onDelete(item, scope); setDeleting(null); }}>
                {scope === "day" ? rec ? "confirmar: apagar só este lançamento" : "confirmar: apagar lançamento" : scope === "future" ? "confirmar: apagar desta data em diante" : "confirmar: apagar recorrência inteira"}
              </Button>)}
              <Button variant="ghost" size="sm" onClick={() => setDeleting(null)}>cancelar</Button>
            </div>}
          </div>
        );
      })}
    </div>
  );
}