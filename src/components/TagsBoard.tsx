import { FitMoney } from "@/components/FitMoney";
import { useEffect, useMemo, useState } from "react";

import { AddWindow } from "@/components/AddWindow";
import { SectionBadge, type SectionKind } from "@/components/SectionBadge";
import { Button } from "@/components/ui/button";

export type TagRow = { tag: string; total: number; count: number; kinds: SectionKind[] };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function TagsBoard({
  rows,
  onAdd,
  onRename,
  onDelete,
}: {
  rows: TagRow[];
  onAdd: () => void;
  onRename: (oldTag: string, newTag: string) => void;
  onDelete: (tag: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<TagRow | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const filtered = q ? rows.filter((r) => r.tag.toLowerCase().includes(q)) : rows;
    return [...filtered].sort((a, b) => b.total - a.total);
  }, [rows, filter]);

  useEffect(() => {
    if (!selected) return;
    setName(selected.tag);
    setError(null);
  }, [selected]);

  const close = () => {
    setSelected(null);
    setError(null);
  };

  const save = () => {
    if (!selected) return;
    const next = name.trim().replace(/^#+/, "");
    if (!next) {
      setError("dê um nome para a tag.");
      return;
    }
    if (next !== selected.tag && rows.some((r) => r.tag.toLowerCase() === next.toLowerCase())) {
      setError("já existe uma tag com esse nome.");
      return;
    }
    if (next !== selected.tag) onRename(selected.tag, next);
    close();
  };

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <label className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="text-muted-foreground">
            ⌕
          </span>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filtrar tags"
            className="h-10 w-full min-w-0 rounded-xl border border-transparent bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
          />
        </label>
        <button
          type="button"
          onClick={onAdd}
          aria-label="criar tag em um lançamento"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-border text-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          ⊕
        </button>
      </div>

      {list.length === 0 ? (
        <div className="grid place-items-center gap-6 rounded-2xl border border-border bg-card px-6 py-16 text-center">
          <span className="grid size-20 place-items-center rounded-full border border-border text-2xl text-muted-foreground">
            ⊕
          </span>
          <p className="text-base text-muted-foreground">
            {rows.length === 0
              ? "sem tags por aqui. toque no botão acima para criar."
              : "nenhuma tag encontrada com esse filtro."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="divide-y divide-border">
            {list.map((r) => (
               <Button
                 variant="ghost"
                key={r.tag}
                type="button"
                onClick={() => setSelected(r)}
                aria-label={`editar tag ${r.tag}`}
                 className="flex h-auto w-full flex-wrap justify-start gap-3 whitespace-normal rounded-none px-4 py-4 text-left transition-colors hover:bg-accent/50"
              >
                 <span className="flex shrink-0 items-center gap-1" aria-label="seções da tag">
                   {r.kinds.map((kind) => <SectionBadge key={kind} kind={kind} />)}
                 </span>
                 <span className="min-w-0 break-words rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                  #{r.tag}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {r.count} lançamento{r.count === 1 ? "" : "s"}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                  <FitMoney value={r.total} />
                </span>
               </Button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <AddWindow
          title={`#${selected.tag}`}
          subtitle="renomeie ou apague esta tag"
          onClose={close}
          deleteActions={[
            {
              key: "tag",
              label: "apagar esta tag",
              tone: "negative",
              onSelect: () => {
                onDelete(selected.tag);
                close();
              },
            },
          ]}
        >
          <div className="space-y-4 pt-1">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                nome da tag
              </span>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                }}
                placeholder="nome da tag"
                autoFocus
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
              />
            </label>
            {error && <p className="text-sm text-negative">{error}</p>}
            <p className="text-xs text-muted-foreground">
              apagar remove a tag de todos os lançamentos; os valores não mudam.
            </p>
            <button
              type="button"
              onClick={save}
              className="h-11 w-full rounded-xl bg-primary text-sm font-bold uppercase tracking-wide text-primary-foreground shadow transition hover:brightness-110"
            >
              salvar
            </button>
          </div>
        </AddWindow>
      )}
    </section>
  );
}
