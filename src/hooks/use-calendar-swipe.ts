import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { calendarGestureDirection, calendarWheelMovement } from "@/lib/calendar-navigation";

/** Time without wheel deltas that ends a trackpad gesture. */
const WHEEL_QUIET_MS = 120;
/** Right after a month commit, the rest of that swipe is always ignored. */
const WHEEL_GUARD_MS = 180;

/**
 * One horizontal gesture moves exactly one month, in both directions.
 * Never ignores a new gesture: a new touch/drag instantly finishes any running
 * animation, and a new trackpad swipe is recognized even while the previous
 * swipe's inertia is still arriving. Vertical scrolling and taps stay native.
 */
export function useCalendarSwipe(onShift: (delta: number) => void, canGoBack: boolean, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ onShift, canGoBack });
  latest.current = { onShift, canGoBack };

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    let active = true;
    let start: { x: number; y: number; id: number; t: number } | null = null;
    let dragging = false;
    let offset = 0;
    let suppressClick = false;
    let animation: Animation | undefined;
    // Finishing step of the running animation; run at once when a new gesture starts.
    let pending: (() => void) | null = null;

    const reduced = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    // The element holds a carousel of month panels; one gesture crosses exactly one panel.
    const panelWidth = () => element.clientWidth / (element.childElementCount || 1);
    const clearStyles = () => {
      element.style.removeProperty("transform");
      element.style.removeProperty("will-change");
    };
    const track = (movement: number) => {
      const width = panelWidth();
      // Stop at the current month instead of dragging into past months.
      offset = movement > 0 && !latest.current.canGoBack ? 0 : Math.max(-width, Math.min(width, movement));
      element.style.transform = `translateX(${offset}px)`;
      element.style.willChange = "transform";
    };
    const finishNow = () => {
      const step = pending;
      pending = null;
      animation?.cancel();
      animation = undefined;
      step?.();
    };
    const shift = (direction: number) => {
      if (!direction || !active) return;
      flushSync(() => latest.current.onShift(direction));
    };

    /** Ends a touch/mouse drag: slide one panel (or back) and commit one month. */
    const settle = (delta: number) => {
      finishNow();
      const direction = delta < 0 && !latest.current.canGoBack ? 0 : delta;
      const target = direction ? -direction * panelWidth() : 0;
      const done = () => {
        if (!active) return;
        shift(direction);
        offset = 0;
        clearStyles();
      };
      if (reduced() || !element.animate || offset === target) {
        done();
        return;
      }
      const run = element.animate(
        [{ transform: `translateX(${offset}px)` }, { transform: `translateX(${target}px)` }],
        { duration: 120, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", fill: "forwards" },
      );
      animation = run;
      pending = done;
      run.finished
        .then(() => {
          if (pending !== done) return;
          pending = null;
          done();
          run.cancel();
          if (animation === run) animation = undefined;
        })
        .catch(() => {});
    };

    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      // A new touch never waits for the previous animation: finish it now.
      finishNow();
      resetWheel();
      suppressClick = false;
      dragging = false;
      // The header retains native horizontal column scrolling on narrow screens.
      if ((event.target as HTMLElement).closest("[data-calendar-columns]")) return;
      start = { x: event.clientX, y: event.clientY, id: event.pointerId, t: Date.now() };
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
        try {
          element.setPointerCapture?.(event.pointerId);
        } catch {
          /* pointer already released */
        }
        event.preventDefault();
        track(dx);
      }
    };
    const up = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      const quick = Date.now() - start.t < 250;
      let delta: number = -calendarGestureDirection(dx, dy);
      // A short, fast flick also counts as one month.
      if (!delta && quick && Math.abs(dx) >= 24 && Math.abs(dx) > Math.abs(dy) * 1.25) delta = dx > 0 ? -1 : 1;
      start = null;
      if (dragging) settle(delta);
      dragging = false;
      // Never let a swallowed click block the next real tap.
      setTimeout(() => { suppressClick = false; }, 0);
    };
    const cancel = () => {
      start = null;
      if (dragging) settle(0);
      dragging = false;
      suppressClick = false;
    };
    const click = (event: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    // Trackpad: commit one month as soon as the swipe passes the threshold. Then the
    // rest of that swipe (its inertia) is ignored, but a new swipe is accepted right
    // away: inertia only fades in the same direction, so a pause, a reversal or a
    // fresh push that grows stronger means the user started a new gesture.
    let wheelTotal = 0;
    let wheelTimer: ReturnType<typeof setTimeout> | undefined;
    let coasting = false;
    let committedAt = 0;
    let lastWheelAt = 0;
    let lastAbs = 0;
    let lastSign = 0;
    function resetWheel() {
      clearTimeout(wheelTimer);
      wheelTotal = 0;
      coasting = false;
    }
    const commitWheel = (delta: number) => {
      clearTimeout(wheelTimer);
      wheelTotal = 0;
      finishNow();
      shift(delta);
      offset = 0;
      clearStyles();
      if (!reduced() && element.animate) {
        animation = element.animate(
          [{ transform: `translateX(${delta * 36}px)` }, { transform: "translateX(0px)" }],
          { duration: 110, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
        );
      }
    };
    const wheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      if ((event.target as HTMLElement).closest("[data-calendar-columns]")) return;
      event.preventDefault();
      if (start) return;
      const now = Date.now();
      const abs = Math.abs(event.deltaX);
      const sign = Math.sign(event.deltaX);
      const gap = now - lastWheelAt;
      const sinceCommit = now - committedAt;
      if (coasting) {
        const paused = gap > WHEEL_QUIET_MS;
        const reversed = sign !== 0 && sign !== lastSign && abs > 3 && sinceCommit > WHEEL_GUARD_MS;
        const pushedAgain = sinceCommit > WHEEL_GUARD_MS * 2 && abs > 10 && abs > lastAbs * 1.6;
        if (!(paused || reversed || pushedAgain)) {
          // Still the same swipe's inertia: swallow it.
          lastWheelAt = now;
          lastAbs = abs;
          lastSign = sign;
          return;
        }
        coasting = false;
        wheelTotal = 0;
      }
      lastWheelAt = now;
      lastAbs = abs;
      lastSign = sign;
      clearTimeout(wheelTimer);
      if (pending) finishNow();
      wheelTotal += calendarWheelMovement(event.deltaX, event.deltaMode, element.clientWidth);
      if (wheelTotal > 0 && !latest.current.canGoBack) wheelTotal = 0;
      track(wheelTotal);
      const threshold = Math.min(90, Math.max(50, panelWidth() * 0.12));
      if (Math.abs(wheelTotal) >= threshold) {
        commitWheel(wheelTotal > 0 ? -1 : 1);
        coasting = true;
        committedAt = now;
        return;
      }
      wheelTimer = setTimeout(() => {
        const delta = -calendarGestureDirection(wheelTotal, 0);
        wheelTotal = 0;
        settle(delta);
      }, 80);
    };

    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", drag);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", cancel);
    element.addEventListener("lostpointercapture", cancel);
    element.addEventListener("click", click, true);
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      active = false;
      pending = null;
      animation?.cancel();
      clearTimeout(wheelTimer);
      clearStyles();
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", drag);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", cancel);
      element.removeEventListener("lostpointercapture", cancel);
      element.removeEventListener("click", click, true);
      element.removeEventListener("wheel", wheel);
    };
  }, [enabled]);
  return ref;
}
