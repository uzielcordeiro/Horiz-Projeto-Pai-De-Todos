import { Loader2 } from "lucide-react";

/** Sobreposição discreta exibida enquanto a sessão é encerrada. */
export function SigningOut({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 grid animate-in fade-in-0 duration-300 place-items-center bg-background/90 backdrop-blur-sm"
    >
      <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Saindo...
      </div>
    </div>
  );
}
