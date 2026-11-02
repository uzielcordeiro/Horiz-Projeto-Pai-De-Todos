/* ======================================================== */
/* INÍCIO: COMPONENTE HORIZONBOARD (PROJEÇÃO FINANCEIRA)     */
/* ======================================================== */

import React, { useState, useRef, useEffect, useMemo } from "react";
import { useStore } from "../lib/user-storage";
import { formatMoney } from "../lib/money-format";
import { Moon, Sun, ArrowUpRight } from "lucide-react";

interface HorizonBoardProps {
  onOpenDayModal?: (dateStr: string) => void;
}

const COLUMN_WIDTH = 160;
const OVERSCAN = 3;

export function HorizonBoard({ onOpenDayModal }: HorizonBoardProps) {
  const { transactions, settings, updateSettings, resetData } = useStore();
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

  const monthsData = useMemo(() => {
    const data = [];
    const startDate = new Date();
    startDate.setDate(1);

    for (let i = 0; i < 24; i++) {
      const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      
      const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
      const monthLabel = d.toLocaleString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");

      data.push({
        key: monthKey,
        label: monthLabel,
        year,
        month,
        daysInMonth,
      });
    }
    return data;
  }, []);

  const totalWidth = monthsData.length * COLUMN_WIDTH;
  const startIndex = Math.max(0, Math.floor(scrollLeft / COLUMN_WIDTH) - OVERSCAN);
  const endIndex = Math.min(monthsData.length, Math.ceil((scrollLeft + containerWidth) / COLUMN_WIDTH) + OVERSCAN);

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
            {monthsData.slice(startIndex, endIndex).map((m, idx) => {
              const absoluteIndex = startIndex + idx;
              return (
                <div
                  key={m.key}
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
                  {monthsData.slice(startIndex, endIndex).map((m, idx) => {
                    const absoluteIndex = startIndex + idx;
                    const isValidDay = dayNum <= m.daysInMonth;

                    return (
                      <div
                        key={`${m.key}-${dayNum}`}
                        style={{
                          position: "absolute",
                          left: `${absoluteIndex * COLUMN_WIDTH}px`,
                          width: `${COLUMN_WIDTH}px`,
                        }}
                        className={`h-full px-2 flex items-center justify-between border-r border-border/30 text-xs transition-colors ${
                          isValidDay ? "hover:bg-secondary/50 cursor-pointer" : "opacity-30 bg-secondary/10"
                        }`}
                        onClick={() => {
                          if (isValidDay && onOpenDayModal) {
                            const dateStr = `${m.year}-${String(m.month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                            onOpenDayModal(dateStr);
                          }
                        }}
                      >
                        {isValidDay ? (
                          <>
                            {/* INÍCIO: BLOCO DA BOLINHA FIXADA À ESQUERDA */}
                            <div className="flex items-center space-x-1.5 relative pl-3">
                              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Maior saldo do mês" />
                              <div className="flex items-center text-slate-700 dark:text-slate-300">
                                <ArrowUpRight className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              </div>
                            </div>
                            {/* FIM DO BLOCO DA BOLINHA */}

                            {/* Valor Monetário Alinhado à Direita */}
                            <span className="font-medium tabular-nums text-right">
                              {formatMoney(1443.40)}
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
