import { useRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { formatMoneyTyping, moneyGhostSuffix } from "@/lib/money-input";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  wrapperClassName?: string;
};

/**
 * Campo de valor no padrão brasileiro: formata enquanto digita e mostra,
 * mais clarinho, as casas decimais que faltam ("10" -> "10" + ",00").
 * Ao sair do campo, completa as casas de verdade.
 * Entende o ponto digitado: 2.5 e 2.50 viram 2,50; 1.000 continua mil.
 */
export function MoneyInput({ value, onValueChange, className, wrapperClassName, onBlur, ...rest }: Props) {
  const ghost = moneyGhostSuffix(value);
  // Memória: último texto mostrado e se a vírgula dele veio de um ponto digitado.
  // Só vale se o texto atual for igual a ele (senão a tela trocou o valor por fora).
  const memory = useRef({ text: "", fromDot: false });
  return (
    <span className={cn("relative block", wrapperClassName)}>
      <input
        {...rest}
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const typedComma = e.target.value.endsWith(",");
          const fromDot = !typedComma && memory.current.text === value && memory.current.fromDot;
          const next = formatMoneyTyping(value, e.target.value, fromDot);
          memory.current = { text: next.value, fromDot: next.fromDot };
          onValueChange(next.value);
        }}
        onBlur={(e) => {
          memory.current = { text: "", fromDot: false };
          if (ghost) onValueChange(value + ghost);
          onBlur?.(e);
        }}
        className={className}
      />
      {ghost && (
        <span
          aria-hidden
          className={cn(
            className,
            "pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre border-transparent bg-transparent shadow-none ring-0",
          )}
        >
          <span className="invisible">{value}</span>
          <span className="text-muted-foreground/60">{ghost}</span>
        </span>
      )}
    </span>
  );
}
