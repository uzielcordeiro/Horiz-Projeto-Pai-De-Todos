import { describe, expect, it } from "vitest";
import { horizonMonthRange, shiftHorizonMonth } from "@/lib/calendar-navigation";

describe("Limite futuro do Horizonte", () => {
  const now = new Date(2026, 9, 12);

  it("inclui outubro de 2026 até outubro de 2036, sem novembro de 2036", () => {
    const months = horizonMonthRange({ y: 2026, m: 9 }, now);
    expect(months).toHaveLength(121);
    expect(months[0]).toEqual({ y: 2026, m: 9 });
    expect(months.at(-1)).toEqual({ y: 2036, m: 9 });
    expect(months).not.toContainEqual({ y: 2036, m: 10 });
  });

  it("mantém o mesmo limite ao avançar por mês ou ano", () => {
    expect(shiftHorizonMonth({ y: 2036, m: 8 }, 1, now)).toEqual({ y: 2036, m: 9 });
    expect(shiftHorizonMonth({ y: 2036, m: 9 }, 1, now)).toEqual({ y: 2036, m: 9 });
    expect(shiftHorizonMonth({ y: 2036, m: 8 }, 12, now)).toEqual({ y: 2036, m: 9 });
    expect(horizonMonthRange({ y: 2036, m: 9 }, now)).toEqual([{ y: 2036, m: 9 }]);
  });

  it("acompanha o mês vigente e mantém dez anos inclusive na virada do ano", () => {
    const months = horizonMonthRange({ y: 2026, m: 9 }, new Date(2027, 0, 3));
    expect(months).toHaveLength(121);
    expect(months[0]).toEqual({ y: 2027, m: 0 });
    expect(months.at(-1)).toEqual({ y: 2037, m: 0 });
    expect(shiftHorizonMonth({ y: 2026, m: 9 }, -12, now)).toEqual({ y: 2026, m: 9 });
  });
});