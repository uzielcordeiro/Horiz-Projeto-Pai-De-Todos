import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { calendarGestureDirection, calendarWheelMovement } from "@/lib/calendar-navigation";

/** One horizontal gesture moves one complete month; vertical scrolling and taps stay native. */
export function useCalendarSwipe(onShift: (delta: number) => void, canGoBack: boolean, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ onShift, canGoBack });
  latest.current = { onShift, canGoBack };

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    let start: { x: number; y: number; id: number } | null = null;
    let dragging = false;
    let locked = false;
    let wheelTotal = 0;
    let offset = 0;
    let wheelTimer: ReturnType<typeof setTimeout> | undefined;
    let suppressClick = false;
    let active = true;
    let animation: Animation | undefined;

    // The element may hold a carousel of month panels side by side; one gesture
    // always crosses exactly one panel (one month), never the whole track.
    const panelWidth = () => element.clientWidth / (element.childElementCount || 1);
    const track = (movement: number) => {
      // Stop at the current month instead of dragging into past months.
      const width = panelWidth();
      offset = movement > 0 && !latest.current.canGoBack ? 0 : Math.max(-width, Math.min(width, movement));
      element.style.transform = `translateX(${offset}px)`;
      element.style.willChange = "transform";
    };
    const settle = async (delta: number) => {
      if (locked) return;
      locked = true;
      const direction = delta < 0 && !latest.current.canGoBack ? 0 : delta;
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const animateTo = async (target: number) => {
        if (!reduced && element.animate && offset !== target) {
          animation = element.animate(
            [{ transform: `translateX(${offset}px)` }, { transform: `translateX(${target}px)` }],
            { duration: 120, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", fill: "forwards" },
          );
          await animation.finished.catch(() => {});
        }
        if (!active) return;
        offset = target;
        element.style.transform = `translateX(${target}px)`;
        animation?.cancel();
      };
      if (direction) {
        await animateTo(-direction * panelWidth());
        if (!active) return;
        flushSync(() => latest.current.onShift(direction));
        // Após a troca, o painel do meio já mostra o mês novo: zera na hora,
        // sem segunda animação (evita o saldo "vir duas vezes").
        animation?.cancel();
        offset = 0;
        element.style.transform = "translateX(0px)";
      } else {
        await animateTo(0);
      }
      element.style.removeProperty("transform");
      element.style.removeProperty("will-change");
      locked = false;
    };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      // A new drag during the closing animation finishes it at once instead of being ignored.
      if (locked) animation?.finish();
      clearTimeout(wheelTimer);
      wheelTotal = 0;
      // The header retains native horizontal column scrolling on narrow screens.
      if ((event.target as HTMLElement).closest("[data-calendar-columns]")) return;
      suppressClick = false;
      dragging = false;
      start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    };
    const drag = (event: PointerEvent) => {
      if (!start || start.id !== event.pointerId) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (!dragging && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        start = null;
        return;
      }
      if (dragging || (Math.abs(dx) > 4 && Math.abs(dx) > Math.abs(dy) * 1.25)) {
        dragging = true;
        suppressClick = true;
        element.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        track(dx);
      }
    };
    const up = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return;
      const delta = -calendarGestureDirection(event.clientX - start.x, event.clientY - start.y);
      start = null;
      if (dragging) void settle(delta);
      dragging = false;
    };
    const cancel = () => { start = null; dragging = false; void settle(0); };
    const click = (event: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };
    // Trackpad: commit a month as soon as the swipe passes the threshold (no waiting
    // for the gesture to end), ignore that swipe's inertia tail, and accept the next
    // swipe immediately when its deltas accelerate again or after a short pause.
    let coasting = false;
    let lastAbs = 0;
    let lastTime = 0;
    let coastTimer: ReturnType<typeof setTimeout> | undefined;
    const commitWheel = (delta: number) => {
      clearTimeout(wheelTimer);
      wheelTotal = 0;
      animation?.cancel();
      flushSync(() => latest.current.onShift(delta));
      offset = 0;
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (!reduced && element.animate) {
        const from = delta * 36;
        animation = element.animate(
          [{ transform: `translateX(${from}px)` }, { transform: "translateX(0px)" }],
          { duration: 110, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
        );
      }
      element.style.removeProperty("transform");
      element.style.removeProperty("will-change");
    };
    const wheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      if ((event.target as HTMLElement).closest("[data-calendar-columns]")) return;
      event.preventDefault();
      if (start) return;
      const now = performance.now();
      const abs = Math.abs(event.deltaX);
      if (coasting) {
        const fresh = now - lastTime > 45 || (abs > lastAbs + 3 && abs > lastAbs * 1.35);
        lastAbs = abs;
        lastTime = now;
        clearTimeout(coastTimer);
        if (!fresh) {
          coastTimer = setTimeout(() => { coasting = false; }, 90);
          return;
        }
        coasting = false;
      }
      lastAbs = abs;
      lastTime = now;
      clearTimeout(wheelTimer);
      if (locked) animation?.finish();
      wheelTotal += calendarWheelMovement(event.deltaX, event.deltaMode, element.clientWidth);
      if (wheelTotal > 0 && !latest.current.canGoBack) wheelTotal = 0;
      track(wheelTotal);
      const threshold = Math.min(120, Math.max(60, panelWidth() * 0.18));
      if (Math.abs(wheelTotal) >= threshold) {
        commitWheel(wheelTotal > 0 ? -1 : 1);
        coasting = true;
        coastTimer = setTimeout(() => { coasting = false; }, 90);
        return;
      }
      wheelTimer = setTimeout(() => {
        const delta = -calendarGestureDirection(wheelTotal, 0);
        wheelTotal = 0;
        void settle(delta);
      }, 80);
    };
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", drag);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", cancel);
    element.addEventListener("click", click, true);
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      active = false;
      animation?.cancel();
      clearTimeout(wheelTimer);
      clearTimeout(coastTimer);
      element.style.removeProperty("transform");
      element.style.removeProperty("will-change");
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", drag);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", cancel);
      element.removeEventListener("click", click, true);
      element.removeEventListener("wheel", wheel);
    };
  }, [enabled]);
  return ref;
}