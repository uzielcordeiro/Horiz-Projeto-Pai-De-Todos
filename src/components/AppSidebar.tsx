import { useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { Menu as MenuIcon, NotebookPen, UserRound, Map as MapIcon, Plus, Tag, Target, Wallet, Table2 } from "lucide-react";
import { CalendarReset } from "@/components/CalendarReset";
import { Button } from "@/components/ui/button";

type Item = { key: string; label: string; icon: React.ReactNode; soon?: boolean };

const NAV: Item[] = [
  { key: "perfil", label: "Conta", icon: <UserRound size={16} strokeWidth={2} /> },
  { key: "saldos", label: "Calendário", icon: <Wallet size={16} strokeWidth={2} /> },
  { key: "totais", label: "Resumo", icon: <Table2 size={16} strokeWidth={2} /> },
  { key: "tags", label: "Tags", icon: <Tag size={16} strokeWidth={2} /> },
  { key: "menu", label: "Dia/Dia", icon: <NotebookPen size={16} strokeWidth={2} /> },
];

export function AppSidebar({
  onAdd,
  onToday,
  onNavigate,
  onReset,
  active = "saldos",
}: {
  onAdd: () => void;
  onToday: () => void;
  onNavigate?: (key: string) => void;
  onReset?: (scope: "month" | "all") => () => void;
  active?: string;
}) {
  const [open, setOpen] = useState(true);
  // Pair each immediate pointerdown activation with its own native click.
  // Tracking the browser pointer id prevents rapid presses on different rows
  // from consuming each other's fallback clicks.
  const pending = useRef(new Map<string, Map<number, number>>());

  const row =
    "flex w-full cursor-pointer touch-manipulation select-none items-center gap-3 rounded-xl px-2 py-2 text-left text-sm font-medium transition-colors";

  // Keep both events: pointerdown gives immediate response, while click is a
  // browser-native fallback if a rapid pointer sequence drops pointerdown.
  const activatePointer =
    (actionName: string, action: () => void) => (event: PointerEvent<HTMLButtonElement>) => {
      if (!event.isPrimary || event.button !== 0) return;
      const actionPointers = pending.current.get(actionName) ?? new Map<number, number>();
      actionPointers.set(event.pointerId, (actionPointers.get(event.pointerId) ?? 0) + 1);
      pending.current.set(actionName, actionPointers);
      action();
    };


  const activateClick =
    (actionName: string, action: () => void) => (event: MouseEvent<HTMLButtonElement>) => {
      const pointerId = (event.nativeEvent as { pointerId?: number }).pointerId;
      const actionPointers = pending.current.get(actionName);
      const credits = pointerId === undefined ? 0 : (actionPointers?.get(pointerId) ?? 0);
      if (actionPointers && pointerId !== undefined && credits > 0) {
        if (credits > 1) actionPointers.set(pointerId, credits - 1);
        else actionPointers.delete(pointerId);
        if (actionPointers.size === 0) pending.current.delete(actionName);
        return;
      }
      action();
    };


  return (
    <aside
      className={`relative z-[60] sticky top-0 flex h-screen shrink-0 flex-col border-r border-border bg-sidebar backdrop-blur-xl transition-[width] duration-200 ${
        open ? "w-40" : "w-11"
      }`}
    >
      <div className="flex h-14 items-center gap-2 px-2">
        <button
          type="button"
          onPointerDown={activatePointer("alternar-menu", () => setOpen((v) => !v))}
          onClick={activateClick("alternar-menu", () => setOpen((v) => !v))}
          aria-label={open ? "recolher menu" : "expandir menu"}
          title={open ? "recolher menu" : "expandir menu"}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-base text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <MenuIcon size={16} strokeWidth={2} />
        </button>
        {open && (
          <span className="truncate font-display text-sm font-semibold text-foreground">
            Menu
          </span>
        )}
      </div>

      <nav className="mt-2 space-y-1 px-2">
        {NAV.map((item) => (
          <Button
            variant="ghost"
            key={item.key}
            type="button"
            data-sidebar-action={item.key}
            aria-disabled={item.soon || undefined}
            onPointerDown={item.soon ? undefined : activatePointer(item.key, () => onNavigate?.(item.key))}
            onClick={item.soon ? undefined : activateClick(item.key, () => onNavigate?.(item.key))}
            aria-label={item.label}
            title={item.label}
            className={`${row} h-auto justify-start ${
              item.key === active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            } ${item.soon ? "cursor-default hover:bg-transparent hover:text-muted-foreground" : ""}`}
          >
            <span className="flex w-4 shrink-0 justify-center">{item.icon}</span>
            {open && <span className="truncate">{item.label}</span>}
          </Button>
        ))}
      </nav>

      <div className="mt-6 space-y-1 border-t border-border px-2 pt-4">
        <button
          type="button"
          data-sidebar-action="adicionar"
          onPointerDown={activatePointer("adicionar", onAdd)}
          onClick={activateClick("adicionar", onAdd)}
          aria-label="Novo"
          title="Novo"
          className={`${row} text-foreground hover:bg-accent/60`}
        >
          <span className="flex w-4 shrink-0 justify-center"><Plus size={16} strokeWidth={2} /></span>
          {open && <span className="truncate">Novo</span>}
        </button>
        <button
          type="button"
          data-sidebar-action="hoje"
          onPointerDown={activatePointer("hoje", onToday)}
          onClick={activateClick("hoje", onToday)}
          aria-label="Hoje"
          title="Hoje"
          className={`${row} text-muted-foreground hover:bg-accent/60 hover:text-foreground`}
        >
          <span className="flex w-4 shrink-0 justify-center"><Target size={16} strokeWidth={2} /></span>
          {open && <span className="truncate">Hoje</span>}
        </button>
        <button
          type="button"
          data-sidebar-action="horizonte"
          onPointerDown={activatePointer("horizonte", () => onNavigate?.("horizonte"))}
          onClick={activateClick("horizonte", () => onNavigate?.("horizonte"))}
          aria-label="Futuro"
          title="Futuro"
          className={`${row} ${
            active === "horizonte"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          }`}
        >
          <span className="flex w-4 shrink-0 justify-center"><MapIcon size={16} strokeWidth={2} /></span>
          {open && <span className="truncate">Futuro</span>}
        </button>
      </div>

      {onReset && (
        <div className="flex flex-1 items-center px-2">
          <CalendarReset onReset={onReset} compact={!open} />
        </div>
      )}
    </aside>
  );
}
