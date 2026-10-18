import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

type Props = { onReset: (scope: "month" | "all") => () => void; compact?: boolean };

export function CalendarReset({ onReset, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [restore, setRestore] = useState<(() => void) | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open && !restore) return;
    const dismiss = (event: PointerEvent) => {
      if (root.current?.contains(event.target as Node)) return;
      setOpen(false);
      setRestore(null);
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [open, restore]);

  const reset = (scope: "month" | "all") => {
    const undo = onReset(scope);
    setRestore(() => undo);
    setOpen(false);
  };

  return (
    <div ref={root} className="relative w-full">
      <Button
        variant="ghost"
        size="sm"
        className={`h-auto items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium text-foreground transition-colors hover:bg-negative/10 hover:text-foreground ${
          compact ? "w-full justify-center px-0" : "w-full justify-start"
        }`}
        aria-label="Resetar tudo"
        title="Resetar tudo"
        aria-haspopup="menu"
        aria-expanded={open || !!restore}
        onClick={() => { if (!restore) setOpen((value) => !value); }}
      >
        <span className="flex w-4 shrink-0 justify-center"><RotateCcw size={16} strokeWidth={2} /></span>
        {!compact && <span className="truncate">Resetar tudo</span>}
      </Button>
      {(open || restore) && (
        <div role="menu" aria-label="Resetar sistema" className="absolute left-0 top-full z-50 mt-2 flex w-36 flex-col gap-2">
          {restore ? (
            <Button role="menuitem" variant="outline" className="rounded-full bg-card shadow-lg" onClick={() => { restore(); setRestore(null); }}>
              Desfazer
            </Button>
          ) : (
            <>
              <Button role="menuitem" variant="outline" className="rounded-full border-negative/40 bg-card text-negative shadow-lg hover:bg-negative/10 hover:text-negative" onClick={() => reset("month")}>
                Resetar este mês?
              </Button>
              <Button role="menuitem" variant="outline" className="rounded-full border-negative/40 bg-card text-negative shadow-lg hover:bg-negative/10 hover:text-negative" onClick={() => reset("all")}>
                Resetar tudo?
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}