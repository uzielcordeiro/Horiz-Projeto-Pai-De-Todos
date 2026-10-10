export type SectionKind = "entradas" | "saidas" | "diarios" | "economias" | "cartao";

export const SECTION_KINDS: SectionKind[] = ["entradas", "saidas", "diarios", "economias", "cartao"];

const sections: Record<SectionKind, { title: string; letter: string; tone: string }> = {
  entradas: { title: "entradas", letter: "E", tone: "bg-positive text-positive-foreground" },
  saidas: { title: "saídas", letter: "S", tone: "bg-negative text-negative-foreground" },
  diarios: { title: "diários", letter: "D", tone: "bg-chart-4 text-primary-foreground" },
  economias: { title: "poupança", letter: "P", tone: "bg-primary text-primary-foreground" },
  cartao: { title: "cartão", letter: "C", tone: "bg-chart-1 text-primary-foreground" },
};

export function SectionBadge({ kind, compact = false }: { kind: SectionKind; compact?: boolean }) {
  const section = sections[kind];
  return (
    <span
      role="img"
      aria-label={section.title}
      title={section.title}
      className={`grid shrink-0 place-items-center rounded-full font-bold ${compact ? "size-4 text-[9px]" : "size-6 text-[11px]"} ${section.tone}`}
    >
      {section.letter}
    </span>
  );
}