import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCalendarSwipe } from "@/hooks/use-calendar-swipe";

afterEach(() => { cleanup(); vi.useRealTimers(); });

function Calendar({ onShift, canGoBack = true }: { onShift: (delta: number) => void; canGoBack?: boolean }) {
  const ref = useCalendarSwipe(onShift, canGoBack, true);
  return <div ref={ref} data-testid="calendar">Calendar</div>;
}

function pointer(element: HTMLElement, type: string, x: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX: x, clientY: 50, pointerId: 1, isPrimary: true, button: 0 });
  fireEvent(element, event);
}

describe("Suivi contínuo do calendário", () => {
  it("acompanha cada movimento antes de soltar o dedo", () => {
    const onShift = vi.fn();
    const { getByTestId } = render(<Calendar onShift={onShift} />);
    const element = getByTestId("calendar");
    Object.defineProperty(element, "clientWidth", { value: 800 });
    pointer(element, "pointerdown", 100);
    pointer(element, "pointermove", 120);
    expect(element.style.transform).toBe("translateX(20px)");
    pointer(element, "pointermove", 180);
    expect(element.style.transform).toBe("translateX(80px)");
    pointer(element, "pointermove", 140);
    expect(element.style.transform).toBe("translateX(40px)");
    expect(onShift).not.toHaveBeenCalled();
  });
  it("acompanha o trackpad imediatamente e troca um único mês quando o gesto termina", async () => {
    vi.useFakeTimers();
    const onShift = vi.fn();
    const { getByTestId } = render(<Calendar onShift={onShift} />);
    const element = getByTestId("calendar");
    Object.defineProperty(element, "clientWidth", { value: 800 });
    fireEvent.wheel(element, { deltaX: -40, deltaY: 0 });
    expect(element.style.transform).toBe("translateX(40px)");
    fireEvent.wheel(element, { deltaX: -50, deltaY: 0 });
    expect(element.style.transform).toBe("translateX(90px)");
    expect(onShift).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(80); });
    expect(onShift).toHaveBeenCalledExactlyOnceWith(-1);
    expect(element.style.transform).toBe("");
  });
  it("bloqueia o movimento para o passado no mês vigente", () => {
    const { getByTestId } = render(<Calendar onShift={vi.fn()} canGoBack={false} />);
    const element = getByTestId("calendar");
    Object.defineProperty(element, "clientWidth", { value: 800 });
    pointer(element, "pointerdown", 100);
    pointer(element, "pointermove", 200);
    expect(element.style.transform).toBe("translateX(0px)");
  });
});
describe("Trackpad com arrastos seguidos", () => {
  it("troca um mês por arrasto, sem esperar o anterior terminar", () => {
    const onShift = vi.fn();
    const { getByTestId } = render(<Calendar onShift={onShift} />);
    const element = getByTestId("calendar");
    Object.defineProperty(element, "clientWidth", { value: 800 });
    const now = vi.spyOn(performance, "now");
    let t = 0;
    const swipe = (deltas: number[]) => deltas.forEach((d) => { t += 16; now.mockReturnValue(t); fireEvent.wheel(element, { deltaX: d, deltaY: 0 }); });
    swipe([30, 60, 50]); // primeiro arrasto passa do limite
    expect(onShift).toHaveBeenCalledTimes(1);
    swipe([30, 20, 10, 5]); // inércia do mesmo arrasto: ignorada
    expect(onShift).toHaveBeenCalledTimes(1);
    swipe([40, 70, 40]); // novo arrasto acelera de novo: aceito na hora
    expect(onShift).toHaveBeenCalledTimes(2);
    expect(onShift).toHaveBeenNthCalledWith(2, 1);
    now.mockRestore();
  });
});
