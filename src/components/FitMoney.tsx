import { brl, compactBrl } from "@/lib/money-format";

/**
 * Exibe o valor formatado. Se o valor (absoluto) for maior ou igual ao
 * limite (threshold), ele é abreviado (ex: 5,25k) e ganha um tooltip nativo
 * mostrando o valor exato.
 */
export function FitMoney({
  value,
  symbol = true,
  threshold = 5000, // Limite padrão: abrevia a partir de 5.000
}: {
  value: number;
  symbol?: boolean;
  threshold?: number;
}) {
  const isLarge = Math.abs(value) >= threshold;
  const fullText = symbol
    ? brl(value)
    : Math.trunc(value).toLocaleString("pt-BR");
  
  const displayText = isLarge ? compactBrl(value, symbol) : fullText;

  return (
    <span
      title={isLarge ? fullText : undefined} // O balão nativo (Tooltip)
      className={`relative inline-block whitespace-nowrap transition-colors ${
        isLarge 
          ? "cursor-help underline decoration-muted-foreground/40 decoration-dotted underline-offset-4 hover:decoration-foreground" 
          : ""
      }`}
    >
      {displayText}
    </span>
  );
}
