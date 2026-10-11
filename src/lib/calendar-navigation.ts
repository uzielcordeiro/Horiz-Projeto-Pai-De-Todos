export type CalendarMonth = { y: number; m: number };

/** Navigation starts at the live current month, including across year boundaries. */
export function shiftCalendarMonth(month: CalendarMonth, delta: number, now = new Date()): CalendarMonth {
  const target = new Date(month.y, month.m + delta, 1);
  const floor = new Date(now.getFullYear(), now.getMonth(), 1);
  const date = target < floor ? floor : target;
  return { y: date.getFullYear(), m: date.getMonth() };
}

export function calendarGestureDirection(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < 60 || Math.abs(dx) <= Math.abs(dy) * 1.25) return 0;
  return dx > 0 ? 1 : -1;
}

/** Native scroll deltas describe the viewport, the opposite of finger/content movement. */
export function calendarWheelMovement(deltaX: number, deltaMode: number, width: number): number {
  return -deltaX * (deltaMode === 1 ? 16 : deltaMode === 2 ? width : 1);
}