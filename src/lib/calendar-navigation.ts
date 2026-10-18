export type CalendarMonth = { y: number; m: number };

/** Navigation starts at the live current month, including across year boundaries. */
export function shiftCalendarMonth(month: CalendarMonth, delta: number, now = new Date()): CalendarMonth {
  const target = new Date(month.y, month.m + delta, 1);
  const floor = new Date(now.getFullYear(), now.getMonth(), 1);
  const date = target < floor ? floor : target;
  return { y: date.getFullYear(), m: date.getMonth() };
}

/** Horizonte ends at the live current month plus five years, inclusive. */
export function shiftHorizonMonth(month: CalendarMonth, delta: number, now = new Date()): CalendarMonth {
  const target = shiftCalendarMonth(month, delta, now);
  const ceiling = { y: now.getFullYear() + 5, m: now.getMonth() };
  return target.y * 12 + target.m > ceiling.y * 12 + ceiling.m ? ceiling : target;
}

export function horizonMonthRange(start: CalendarMonth, now = new Date()): CalendarMonth[] {
  const first = shiftHorizonMonth(start, 0, now);
  const last = (now.getFullYear() + 5) * 12 + now.getMonth();
  const count = last - (first.y * 12 + first.m) + 1;
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(first.y, first.m + offset, 1);
    return { y: date.getFullYear(), m: date.getMonth() };
  });
}

export function calendarGestureDirection(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < 60 || Math.abs(dx) <= Math.abs(dy) * 1.25) return 0;
  return dx > 0 ? 1 : -1;
}

/** Native scroll deltas describe the viewport, the opposite of finger/content movement. */
export function calendarWheelMovement(deltaX: number, deltaMode: number, width: number): number {
  return -deltaX * (deltaMode === 1 ? 16 : deltaMode === 2 ? width : 1);
}