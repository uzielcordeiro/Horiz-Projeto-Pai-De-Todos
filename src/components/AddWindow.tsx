import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  title?: string;
  subtitle?: string | undefined;
  dateHero?: { day: string; month: string; year: string } | undefined;
  onClose: () => void;
  headerAction?: ReactNode;
  deleteActions?: {
    key: string;
    label: string;
    tone?: "negative" | "warning";
    disabled?: boolean;
    onSelect: () => void;
  }[] | undefined;
  onDeleteDay?: (() => void) | undefined;
  onDeleteMonth?: (() => void) | undefined;
  deleteDayDisabled?: boolean | undefined;
  deleteMonthDisabled?: boolean | undefined;
  onDeleteItem?: (() => void) | undefined;
  children: ReactNode;
};

export function AddWindow({
  title = "adicionar",
  subtitle,
  dateHero,
  onClose,
  headerAction,
  deleteActions,
  onDeleteDay,
  onDeleteMonth,
  deleteDayDisabled = false,
  deleteMonthDisabled = false,
  onDeleteItem,
  children,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [itemConfirm, setItemConfirm] = useState(false);
  const itemConfirmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!itemConfirm) return;
    const onDown = (e: PointerEvent) => {
      if (!itemConfirmRef.current?.contains(e.target as Node)) setItemConfirm(false);
    };
    const onFocus = (e: FocusEvent) => {
      if (!itemConfirmRef.current?.contains(e.target as Node)) setItemConfirm(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("focusin", onFocus, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("focusin", onFocus, true);
    };
  }, [itemConfirm]);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(null), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  const actions =
    deleteActions ??
    [
      onDeleteDay
        ? {
            key: "day",
            label: "apagar este dia",
            tone: "negative" as const,
            disabled: deleteDayDisabled,
            onSelect: onDeleteDay,
          }
        : null,
      onDeleteMonth
        ? {
            key: "month",
            label: "apagar este mês",
            tone: "warning" as const,
            disabled: deleteMonthDisabled,
            onSelect: onDeleteMonth,
          }
        : null,
    ].filter((action): action is NonNullable<typeof action> => action !== null);
  const hasDelete = actions.length > 0;
  const allDisabled = actions.every((action) => action.disabled);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[85vh] w-[92vw] max-w-[360px] flex-col overflow-hidden rounded-3xl border border-border bg-secondary/70 shadow-2xl"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-5 pt-5 pb-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0 flex-1">
              <h2
                className={`truncate font-display text-foreground ${
                  dateHero ? "text-xl font-extrabold tracking-tight" : "text-2xl font-bold"
                }`}
              >
                {title}
              </h2>
              {dateHero ? (
                <p className="mt-0.5 truncate text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {dateHero.month} {dateHero.year}
                </p>
              ) : (
                subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
              )}
            </div>
            {dateHero && (
              <div className="w-11 shrink-0 overflow-hidden rounded-xl border border-border bg-card text-center shadow-sm">
                <div className="bg-negative py-0.5 text-[9px] font-bold uppercase tracking-wide text-negative-foreground">
                  {dateHero.month.slice(0, 3)}
                </div>
                <div className="pb-1 pt-0.5 font-display text-xl font-extrabold leading-none text-foreground tabular-nums">
                  {dateHero.day}
                </div>
              </div>
            )}
          </div>
          {headerAction}
          {hasDelete && (
            <div className="relative">
              <button
                ref={triggerRef}
                type="button"
                disabled={allDisabled}
                aria-label={menuOpen ? "fechar opções de apagar" : "apagar"}
                aria-expanded={menuOpen}
                title={allDisabled ? "nada para apagar" : "apagar"}
                onClick={() => {
                  if (allDisabled) return;
                  setMenuOpen((v) => !v);
                  setConfirming(null);
                }}
                className={`flex h-9 shrink-0 items-center justify-center rounded-full px-3.5 text-xs font-bold uppercase tracking-wide transition-all ${
                  allDisabled
                    ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                    : menuOpen || confirming
                      ? "bg-negative text-negative-foreground shadow-lg"
                      : "bg-negative text-negative-foreground shadow hover:brightness-110"
                }`}
              >
                apagar
              </button>

              {menuOpen && (
                <div
                  className="absolute right-0 top-full z-50 mt-2 min-w-[11rem] overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-xl"
                  role="menu"
                >
                  {actions.map((action) => (
                    <DeleteOption
                      key={action.key}
                      label={confirming === action.key ? "confirmar" : action.label}
                      disabled={action.disabled === true}
                      confirming={confirming === action.key}
                      tone={action.tone ?? "negative"}
                      onSelect={() => {
                        if (confirming === action.key) {
                          setConfirming(null);
                          setMenuOpen(false);
                          action.onSelect();
                          return;
                        }
                        setConfirming(action.key);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          {onDeleteItem ? (
            <div ref={itemConfirmRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setItemConfirm((v) => !v)}
                aria-expanded={itemConfirm}
                className="h-8 shrink-0 rounded-lg border border-negative/40 bg-negative/10 px-2.5 text-xs font-semibold text-negative transition-colors hover:bg-negative/20"
              >
                apagar
              </button>
              {itemConfirm && (
                <div className="absolute right-0 top-full z-50 mt-2 min-w-[11rem] overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-xl">
                  <p className="px-3 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">tem certeza?</p>
                  <DeleteOption
                    label="tenho certeza"
                    disabled={false}
                    confirming={false}
                    tone="negative"
                    onSelect={() => {
                      setItemConfirm(false);
                      onDeleteItem();
                      onClose();
                    }}
                  />
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="grid size-9 shrink-0 place-items-center rounded-full text-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              ×
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">{children}</div>
      </div>
    </div>
  );
}

function DeleteOption({
  label,
  disabled,
  confirming,
  tone,
  onSelect,
}: {
  label: string;
  disabled: boolean;
  confirming: boolean;
  tone: "negative" | "warning";
  onSelect: () => void;
}) {
  const base =
    tone === "negative"
      ? "text-negative hover:bg-negative hover:text-negative-foreground"
      : "text-warning hover:bg-warning hover:text-warning-foreground";
  const active =
    tone === "negative"
      ? "bg-negative text-negative-foreground"
      : "bg-warning text-warning-foreground";

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors ${
        disabled ? "cursor-not-allowed text-muted-foreground/50" : confirming ? active : base
      }`}
    >
      <span>{label}</span>
      {!disabled && (
        <span
          className={`ml-3 size-2 rounded-full ${
            tone === "negative" ? "bg-negative/60" : "bg-warning/60"
          }`}
          aria-hidden="true"
        />
      )}
    </button>
  );
}
