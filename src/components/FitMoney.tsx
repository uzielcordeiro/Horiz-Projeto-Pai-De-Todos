import { brl, compactBrl } from "@/lib/money-format";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Exibe o valor formatado. Se o valor (absoluto) for maior ou igual ao
 * limite (threshold), ele é abreviado (ex: 5,25k) e ganha um tooltip CSS
 * renderizado via Portal (garantindo que nunca seja cortado por tabelas).
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

  // Estados para controlar o tooltip instantâneo e sua posição
  const [show, setShow] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const spanRef = useRef<HTMLSpanElement>(null);
  const [mounted, setMounted] = useState(false);

  // Garante que o Portal só será invocado no client-side para evitar erros
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleMouseEnter = () => {
    if (!isLarge || !spanRef.current) return;
    const rect = spanRef.current.getBoundingClientRect();
    setCoords({
      top: rect.top,
      left: rect.left + rect.width / 2, // Centraliza no meio da palavra
    });
    setShow(true);
  };

  const handleMouseLeave = () => {
    setShow(false);
  };

  return (
    <>
      <span
        ref={spanRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative inline-block whitespace-nowrap"
      >
        {displayText}
      </span>

      {/* Renderiza o Tooltip na raiz do documento para ignorar qualquer barreira de layout */}
      {mounted && isLarge && show &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full pb-1.5"
            style={{ top: coords.top, left: coords.left }}
          >
            <div className="relative whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs font-semibold text-background shadow-lg">
              {fullText}
              <span className="absolute left-1/2 top-full -translate-x-1/2 border-[4px] border-transparent border-t-foreground" />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
