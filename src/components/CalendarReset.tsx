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
    <div ref={root} className="relative justify-self-center">
      <Button
        variant="outline"
        size="sm"
        className={`rounded-full border-negative/40 bg-negative/10 text-negative hover:bg-negative/20 hover:text-negative ${
          compact ? "size-8 p-0" : ""
        }`}
        aria-label="Resetar Tudo"
        title="Resetar Tudo"
        aria-haspopup="menu"
        aria-expanded={open || !!restore}
        onClick={() => { if (!restore) setOpen((value) => !value); }}
      >
        {compact ? <RotateCcw /> : "Resetar Tudo"}
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