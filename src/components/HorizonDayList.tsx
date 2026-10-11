import { Button } from "@/components/ui/button";
import { FitMoney } from "@/components/FitMoney";
import { SectionBadge, type SectionKind } from "@/components/SectionBadge";
import { CalendarItemLabel } from "@/components/CalendarItemLabel";
import { monthItemLabel } from "@/lib/month-item-label";

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
  onSelect: (item: HorizonListItem) => void;
};

export function HorizonDayList({ items, onSelect }: Props) {
  return (
    <div className="space-y-2 pt-2">
      <div className="rounded-xl bg-card p-2">
        <p className="px-2 pt-1 pb-1 text-xs font-bold uppercase text-muted-foreground">
          dia {Number(items[0]?.date.slice(-2))}
        </p>
      {items.map((item) => (
          <Button
            key={item.key}
            variant="ghost"
            onClick={() => onSelect(item)}
            className="grid h-auto w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg px-2 py-2 text-left whitespace-normal"
          >
            <SectionBadge kind={item.kind} compact />
            <CalendarItemLabel
              label={monthItemLabel(item.detail, Boolean(item.recurrenceId))}
              kind={item.kind}
              tags={item.tags}
            />
            <span className={`text-sm font-bold tabular-nums ${item.kind === "entradas" ? "text-positive" : item.kind === "economias" ? "text-foreground" : "text-negative"}`}>
              <FitMoney value={item.amount} />
            </span>
            <span aria-hidden className="text-muted-foreground">›</span>
          </Button>
      ))}
      </div>
    </div>
  );
}