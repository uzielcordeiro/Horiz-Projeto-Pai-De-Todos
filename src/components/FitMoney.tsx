import { brl, compactBrl } from "@/lib/money-format";

/**
 * Exibe o valor formatado. Se o valor (absoluto) for maior ou igual ao
 * limite (threshold), ele é abreviado (ex: 5,25k) e ganha um tooltip CSS
 * 100% instantâneo mostrando o valor exato, sem linhas ou cursores nativos.
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
      className={`relative inline-block whitespace-nowrap ${
        isLarge ? "group" : ""
      }`}
    >
      {displayText}
      
      {/* Tooltip Customizado Instantâneo */}
      {isLarge && (
        <span className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs font-semibold text-background opacity-0 transition-none group-hover:visible group-hover:opacity-100">
          {fullText}
          {/* Triângulo do balãozinho */}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-[4px] border-transparent border-t-foreground" />
        </span>
      )}
    </span>
  );
}
