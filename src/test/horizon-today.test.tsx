import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { HorizonBoard } from "@/components/HorizonBoard";
import { horizonMonthRange } from "@/lib/calendar-navigation";

afterEach(cleanup);

it("hoje retorna de dez anos à frente ao mês vigente e zera a rolagem", () => {
  const now = new Date(2026, 9, 13);
  function Board() {
    const [start, setStart] = useState({ y: 2036, m: 9 });
    const months = horizonMonthRange(start, now).map((month) => ({
      ...month, label: `${month.y}-${month.m + 1}`, days: [],
    }));
    return <HorizonBoard months={months} todayIso="2026-10-13" onShift={() => {}}
      onPick={() => {}} onToday={() => setStart({ y: now.getFullYear(), m: now.getMonth() })} />;
  }
  render(<Board />);
  const future = screen.getByRole("button", { name: "2036-10" });
  const scroller = future.parentElement?.parentElement?.parentElement;
  if (!scroller) throw new Error("Missing horizon scroller");
  scroller.scrollLeft = 18000;
  scroller.scrollTop = 700;
  fireEvent.click(screen.getByRole("button", { name: "hoje" }));
  expect(screen.getByRole("button", { name: "2026-10" })).toBeInTheDocument();
  expect(scroller.scrollLeft).toBe(0);
  expect(scroller.scrollTop).toBe(0);
});