import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SectionBadge, type SectionKind } from "@/components/SectionBadge";
import { TagsBoard } from "@/components/TagsBoard";
import { summarizeTags } from "@/lib/tag-summary";
import type { Recurrence } from "@/lib/recurrence";

afterEach(cleanup);

describe("Tag section identifiers", () => {
  it.each([
    ["entradas", "entradas", "E", "bg-positive"],
    ["saidas", "saídas", "S", "bg-negative"],
    ["diarios", "diários", "D", "bg-chart-4"],
    ["economias", "poupança", "P", "bg-category-savings"],
    ["cartao", "cartão", "C", "bg-chart-1"],
  ])("matches the calendar badge for %s", (kind, title, letter, tone) => {
    render(<SectionBadge kind={kind as SectionKind} />);
    const badge = screen.getByRole("img", { name: title });
    expect(badge).toHaveTextContent(letter);
    expect(badge).toHaveClass(tone);
  });

  it("shows every source section on a shared tag and preserves filtering and editing", () => {
    render(<TagsBoard rows={[
      { tag: "fixo", total: 300, count: 2, kinds: ["entradas", "saidas"], details: [{ date: "2026-10-11", installments: 12, recurring: true }] },
      { tag: "reserva", total: 50, count: 1, kinds: ["economias"], details: [{ date: "2026-10-12", installments: null, recurring: false }] },
    ]} onAdd={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} />);
    const row = screen.getByRole("button", { name: "editar tag fixo" });
    expect(within(row).getByRole("img", { name: "entradas" })).toHaveTextContent("E");
    expect(within(row).getByRole("img", { name: "saídas" })).toHaveTextContent("S");
    expect(row).toHaveTextContent("Dia 11/Out");
    expect(row).toHaveTextContent("1/12 lançamentos");
    expect(screen.getByRole("button", { name: "editar tag reserva" })).toHaveTextContent("Dia 12/Out · não repete");
    fireEvent.change(screen.getByPlaceholderText("filtrar tags"), { target: { value: "fixo" } });
    expect(screen.queryByRole("button", { name: "editar tag reserva" })).not.toBeInTheDocument();
    fireEvent.click(row);
    expect(screen.getByPlaceholderText("nome da tag")).toHaveValue("fixo");
  });

  it.each(["entradas", "saidas", "diarios", "economias", "cartao"] as const)("summarizes installments once and keeps totals for %s", (kind) => {
    const recurrence: Recurrence = {
      id: "salary", kind, name: "Salário", label: "", tags: ["salário"], amount: 100,
      freq: "monthly", daysOfMonth: [11], daysOfWeek: [], startDate: "2026-10-11", installments: 12, skipped: [],
    };
    const rows = summarizeTags([], [recurrence], "2026-10-31");
    expect(rows[0]).toMatchObject({ total: 1200, count: 12, kinds: [kind], details: [{ date: "2026-10-11", installments: 12, recurring: true }] });
    render(<TagsBoard rows={rows} onAdd={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole("button", { name: "editar tag salário" })).toHaveTextContent("Dia 11/Out · 1/12 lançamentos");
  });

  it("keeps distinct dates and installment plans on a shared tag", () => {
    const recurrence: Recurrence = {
      id: "plan", kind: "cartao", name: "Compra", label: "", tags: ["casa"], amount: 10,
      freq: "monthly", daysOfMonth: [15], daysOfWeek: [], startDate: "2026-10-15", installments: 6, skipped: [],
    };
    const rows = summarizeTags([{ date: "2026-10-11", amount: 20, kind: "saidas", tags: ["casa", "casa"] }], [recurrence], "2026-10-31");
    expect(rows[0]?.total).toBe(80);
    expect(rows[0]?.details).toHaveLength(2);
    render(<TagsBoard rows={rows} onAdd={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} />);
    const row = screen.getByRole("button", { name: "editar tag casa" });
    expect(row).toHaveTextContent("Dia 11/Out · não repete");
    expect(row).toHaveTextContent("Dia 15/Out · 1/6 lançamentos");
  });

  it("uses the requested label whenever no installment count is set", () => {
    render(<TagsBoard rows={[{ tag: "fixo", total: 100, count: 1, kinds: ["entradas"], details: [{ date: "2026-10-11", installments: null, recurring: true }] }]} onAdd={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole("button", { name: "editar tag fixo" })).toHaveTextContent("Dia 11/Out · não repete");
  });
});