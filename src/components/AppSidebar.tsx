import { useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { CalendarReset } from "@/components/CalendarReset";

type Item = { key: string; label: string; icon: string; soon?: boolean };

const NAV: Item[] = [
  { key: "saldos", label: "Saldos", icon: "▦" },
  { key: "totais", label: "Totais", icon: "▤" },
  { key: "tags", label: "Tags", icon: "◫" },
  { key: "menu", label: "Menu", icon: "≡" },
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
      className={`relative z-[60] sticky top-0 flex h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 ${
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
          ☰
        </button>
        {open && (
          <span className="truncate font-display text-sm font-semibold text-foreground">
            linha do tempo
          </span>
        )}
      </div>

      <nav className="mt-2 space-y-1 px-2">
        {NAV.map((item) => (
          <button
            key={item.key}
            type="button"
            data-sidebar-action={item.key}
            disabled={item.soon}
            onPointerDown={activatePointer(item.key, () => onNavigate?.(item.key))}
            onClick={activateClick(item.key, () => onNavigate?.(item.key))}
            aria-label={item.label}
            title={item.soon ? "em breve" : item.label}
            className={`${row} ${
              item.key === active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            } disabled:cursor-not-allowed disabled:opacity-45`}
          >
            <span className="w-4 shrink-0 text-center">{item.icon}</span>
            {open && <span className="truncate">{item.label}</span>}
          </button>
        ))}
      </nav>

      <div className="mt-6 space-y-1 border-t border-border px-2 pt-4">
        <button
          type="button"
          data-sidebar-action="adicionar"
          onPointerDown={activatePointer("adicionar", onAdd)}
          onClick={activateClick("adicionar", onAdd)}
          aria-label="adicionar"
          title="adicionar"
          className={`${row} text-foreground hover:bg-accent/60`}
        >
          <span className="w-4 shrink-0 text-center text-positive">＋</span>
          {open && <span className="truncate">adicionar</span>}
        </button>
        <button
          type="button"
          data-sidebar-action="hoje"
          onPointerDown={activatePointer("hoje", onToday)}
          onClick={activateClick("hoje", onToday)}
          aria-label="ir pra hoje"
          title="ir pra hoje"
          className={`${row} text-muted-foreground hover:bg-accent/60 hover:text-foreground`}
        >
          <span className="w-4 shrink-0 text-center">◉</span>
          {open && <span className="truncate">ir pra hoje</span>}
        </button>
        <button
          type="button"
          data-sidebar-action="horizonte"
          onPointerDown={activatePointer("horizonte", () => onNavigate?.("horizonte"))}
          onClick={activateClick("horizonte", () => onNavigate?.("horizonte"))}
          aria-label="horizonte"
          title="horizonte"
          className={`${row} ${
            active === "horizonte"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          }`}
        >
          <span className="w-4 shrink-0 text-center">▩</span>
          {open && <span className="truncate">Horizonte</span>}
        </button>
      </div>

      {onReset && (
        <div className="relative min-h-32 flex-1">
          <div className={`absolute top-1/2 -translate-y-1/2 ${open ? "left-4" : "left-2"}`}>
            <CalendarReset onReset={onReset} compact={!open} />
          </div>
        </div>
      )}
    </aside>
  );
}
