import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SectionBadge, type SectionKind } from "@/components/SectionBadge";
import { TagsBoard } from "@/components/TagsBoard";

afterEach(cleanup);

describe("Tag section identifiers", () => {
  it.each([
    ["entradas", "entradas", "E", "bg-positive"],
    ["saidas", "saídas", "S", "bg-negative"],
    ["diarios", "diários", "D", "bg-chart-4"],
    ["economias", "poupança", "P", "bg-primary"],
    ["cartao", "cartão", "C", "bg-chart-1"],
  ])("matches the calendar badge for %s", (kind, title, letter, tone) => {
    render(<SectionBadge kind={kind as SectionKind} />);
    const badge = screen.getByRole("img", { name: title });
    expect(badge).toHaveTextContent(letter);
    expect(badge).toHaveClass(tone);
  });

  it("shows every source section on a shared tag and preserves filtering and editing", () => {
    render(<TagsBoard rows={[
      { tag: "fixo", total: 300, count: 2, kinds: ["entradas", "saidas"] },
      { tag: "reserva", total: 50, count: 1, kinds: ["economias"] },
    ]} onAdd={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} />);
    const row = screen.getByRole("button", { name: "editar tag fixo" });
    expect(within(row).getByRole("img", { name: "entradas" })).toHaveTextContent("E");
    expect(within(row).getByRole("img", { name: "saídas" })).toHaveTextContent("S");
    expect(row).toHaveTextContent("2 lançamentos");
    fireEvent.change(screen.getByPlaceholderText("filtrar tags"), { target: { value: "fixo" } });
    expect(screen.queryByRole("button", { name: "editar tag reserva" })).not.toBeInTheDocument();
    fireEvent.click(row);
    expect(screen.getByPlaceholderText("nome da tag")).toHaveValue("fixo");
  });
});