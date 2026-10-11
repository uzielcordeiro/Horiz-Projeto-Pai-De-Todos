import { describe, expect, it } from "vitest";
import { calendarGestureDirection, calendarWheelMovement, shiftCalendarMonth } from "@/lib/calendar-navigation";

describe("Navegação horizontal do calendário", () => {
  const now = new Date(2026, 9, 11);
  it("avança outubro para novembro e novembro para dezembro, um mês inteiro por vez", () => {
    const november = shiftCalendarMonth({ y: 2026, m: 9 }, calendarGestureDirection(120, 5), now);
    expect(november).toEqual({ y: 2026, m: 10 });
    expect(shiftCalendarMonth(november, calendarGestureDirection(120, 0), now)).toEqual({ y: 2026, m: 11 });
  });
  it("volta de dezembro até outubro e nunca passa do mês vigente", () => {
    const november = shiftCalendarMonth({ y: 2026, m: 11 }, calendarGestureDirection(-120, 0), now);
    const october = shiftCalendarMonth(november, -1, now);
    expect(november).toEqual({ y: 2026, m: 10 });
    expect(october).toEqual({ y: 2026, m: 9 });
    expect(shiftCalendarMonth(october, -1, now)).toEqual(october);
    expect(shiftCalendarMonth(november, -12, now)).toEqual(october);
  });
  it("acompanha o mês atual e cruza a virada do ano", () => {
    expect(shiftCalendarMonth({ y: 2026, m: 11 }, 1, now)).toEqual({ y: 2027, m: 0 });
    expect(shiftCalendarMonth({ y: 2027, m: 0 }, -1, new Date(2027, 0, 4))).toEqual({ y: 2027, m: 0 });
  });
  it("não troca o mês em rolagem vertical ou movimentos curtos", () => {
    expect(calendarGestureDirection(100, 150)).toBe(0);
    expect(calendarGestureDirection(30, 0)).toBe(0);
  });
  it("faz o trackpad mover o conteúdo na direção dos dedos, oposta ao delta nativo", () => {
    expect(calendarWheelMovement(120, 0, 800)).toBe(-120);
    expect(calendarWheelMovement(-120, 0, 800)).toBe(120);
    expect(calendarGestureDirection(calendarWheelMovement(-120, 0, 800), 0)).toBe(1);
    expect(calendarGestureDirection(calendarWheelMovement(120, 0, 800), 0)).toBe(-1);
  });
});