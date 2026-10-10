import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HorizonBoard, type HorizonMonth } from "@/components/HorizonBoard";

afterEach(cleanup);

function month(balances: number[], m = 9): HorizonMonth {
  return {
    y: 2026, m, label: `Mês ${m + 1}`,
    days: balances.map((balance, i) => ({
      day: i + 1, date: `2026-${m + 1}-${i + 1}`, balance,
      status: balance <= -1000 ? "negativeDeep" : balance >= 2000 ? "surplus" : "warning",
    })),
  };
}

function show(months: HorizonMonth[]) {
  return render(<HorizonBoard months={months} todayIso="" onShift={vi.fn()} onPick={vi.fn()} />);
}

describe("Lembretes mensais do Horizonte", () => {
  it("marca o menor e o maior saldo, não todos os dias fortes", () => {
    show([month([-1500, -5000, -2000, 2500, 9000, 3000])]);
    expect(screen.getByRole("img", { name: "Menor saldo do mês" }).closest("button")).toHaveAttribute("data-horizon-day", "2026-10-2");
    expect(screen.getByRole("img", { name: "Maior saldo do mês" }).closest("button")).toHaveAttribute("data-horizon-day", "2026-10-5");
  });

  it("não marca valores fora dos limites", () => {
    show([month([-999.99, 2000])]);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("inclui menos mil e só marca verde acima de dois mil", () => {
    show([month([-1000, 2000.01])]);
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  it("marca somente o primeiro dia em cada empate", () => {
    show([month([-5000, -5000, 9000, 9000])]);
    expect(screen.getByRole("img", { name: "Menor saldo do mês" }).closest("button")).toHaveAttribute("data-horizon-day", "2026-10-1");
    expect(screen.getByRole("img", { name: "Maior saldo do mês" }).closest("button")).toHaveAttribute("data-horizon-day", "2026-10-3");
  });

  it("seleciona extremos independentemente em cada mês", () => {
    show([month([-5000, 9000]), month([-2000, 3000], 10)]);
    expect(screen.getAllByRole("img", { name: "Menor saldo do mês" })).toHaveLength(2);
    expect(screen.getAllByRole("img", { name: "Maior saldo do mês" })).toHaveLength(2);
  });
});