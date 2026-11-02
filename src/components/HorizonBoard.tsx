/* ======================================================== */
/* INÍCIO: COMPONENTE HORIZONBOARD (PROJEÇÃO FINANCEIRA)    */
/* ======================================================== */

import React, { useState, useRef, useEffect } from "react";
import { Moon, Sun, ArrowUpRight, ArrowDownRight } from "lucide-react";

export type HorizonDay = {
  day: number;
  date: string;
  balance: number;
  status: "positive" | "warning" | "negative" | "negativeDeep" | "surplus";
  hasIncome: boolean;
  hasExpense: boolean;
};

export type HorizonMonth = {
  y: number;
  m: number;
  label: string;
  days: HorizonDay[];
};

interface HorizonBoardProps {
  highlightDate?: string | null;
  months: HorizonMonth[];
  todayIso: string;
  onToday: () => void;
  onShift: (delta: number) => void;
  onPick: (y: number, m: number, day: number) => void;
}

const COLUMN_WIDTH = 160;
const OVERSCAN = 3;

/* ======================================================== */
/* FORMATAÇÃO MONETÁRIA NATIVA                              */
/* ======================================================== */
const formatMoney = (val: number) => {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
};

export function HorizonBoard({ highlightDate, months, todayIso, onToday, onShift, onPick }: HorizonBoardProps) {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [containerWidth, setContainerWidth] = useState(1200);

  useEffect(() => {
    if (scrollContainerRef.current) {
      setContainerWidth(scrollContainerRef.current.clientWidth);
    }
    const handleResize = () => {
      if (scrollContainerRef.current) {
        setContainerWidth(scrollContainerRef.current.clientWidth);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
  };

  const totalWidth = months.length * COLUMN_WIDTH;
  const startIndex = Math.max(0, Math.floor(scrollLeft / COLUMN_WIDTH) - OVERSCAN);
  const endIndex = Math.min(months.length, Math.ceil((scrollLeft + containerWidth) / COLUMN_WIDTH) + OVERSCAN);

  return (
    <div className={`flex flex-col h-full w-full select-none ${isDarkMode ? "dark bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"}`}>
      
      {/* CABEÇALHO DO HORIZON BOARD COM Z-INDEX BLINDADO */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background z-30 sticky top-0 shadow-sm">
        <div className="flex items-center space-x-3">
          <h1 className="text-xl font-bold tracking-tight">Projeção</h1>
          <span className="text-xs px-2.5 py-1 rounded-full bg-secondary text-muted-foreground font-medium">
            GPS Financeiro Contínuo
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          <button onClick={onToday} className="mr-3 text-xs font-bold uppercase text-primary hover:opacity-80 transition-opacity">
            Hoje
          </button>
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-full hover:bg-secondary transition-colors"
            title="Alternar Tema"
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>
        </div>
      </div>

      {/* GRADE VIRTUALIZADA DE MESES E DIAS */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto relative w-full"
      >
        <div style={{ width: `${totalWidth}px`, height: "100%", position: "relative" }}>
          
          {/* Cabeçalho dos Meses */}
          <div className="sticky top-0 z-20 flex bg-background border-b border-border shadow-xs">
            {months.slice(startIndex, endIndex).map((m, idx) => {
              const absoluteIndex = startIndex + idx;
              return (
                <div
                  key={`${m.y}-${m.m}`}
                  style={{
                    position: "absolute",
                    left: `${absoluteIndex * COLUMN_WIDTH}px`,
                    width: `${COLUMN_WIDTH}px`,
                  }}
                  className="py-3 text-center font-semibold text-sm border-r border-border truncate bg-card/80 backdrop-blur-xs"
                >
                  {m.label}
                </div>
              );
            })}
          </div>

          {/* Linhas dos Dias (1 a 31) */}
          <div className="relative pt-2">
            {Array.from({ length: 31 }).map((_, dayIndex) => {
              const dayNum = dayIndex + 1;
              return (
                <div key={dayNum} className="flex h-11 items-center border-b border-border/40">
                  {months.slice(startIndex, endIndex).map((m, idx) => {
                    const absoluteIndex = startIndex + idx;
                    const dayData = m.days.find(d => d.day === dayNum);
                    const isValidDay = !!dayData;
                    const isToday = dayData?.date === todayIso;
                    const isHighlighted = dayData?.date === highlightDate;

                    return (
                      <div
                        key={`${m.y}-${m.m}-${dayNum}`}
                        style={{
                          position: "absolute",
                          left: `${absoluteIndex * COLUMN_WIDTH}px`,
                          width: `${COLUMN_WIDTH}px`,
                        }}
                        className={`h-full px-2 flex items-center justify-between border-r border-border/30 text-xs transition-colors ${
                          isValidDay ? "hover:bg-secondary/50 cursor-pointer" : "opacity-30 bg-secondary/10"
                        } ${isHighlighted ? "bg-primary/20" : ""}`}
                        onClick={() => {
                          if (isValidDay) onPick(m.y, m.m, dayNum);
                        }}
                      >
                        {isValidDay ? (
                          <>
                            {/* BLOCO DE MARCADORES (ESQUERDA) */}
                            <div className="flex items-center space-x-1.5 relative pl-3">
                              {isToday && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-500 shrink-0" title="Hoje" />}
                              {dayData.status === "negativeDeep" && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-red-500 shrink-0" title="Maior dívida" />}
                              {dayData.status === "surplus" && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Maior saldo" />}
                              
                              <div className="flex items-center">
                                {dayData.hasIncome && <ArrowUpRight className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />}
                                {dayData.hasExpense && <ArrowDownRight className="w-3 h-3 text-red-600 dark:text-red-400" />}
                              </div>
                            </div>

                            {/* VALOR MONETÁRIO COM COR DINÂMICA (DIREITA) */}
                            <span className={`font-medium tabular-nums text-right ${dayData.status.includes('negative') ? 'text-red-500 dark:text-red-400' : ''}`}>
                              {formatMoney(dayData.balance)}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground/30 text-[10px] mx-auto">-</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
}
/* ======================================================== */
/* FIM DO COMPONENTE HORIZONBOARD                           */
/* ======================================================== */
