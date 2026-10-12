import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { submitOnEnter } from "@/lib/enter-submit";
import { TagsBoard } from "@/components/TagsBoard";

describe("Enter to save", () => {
  it("runs the same save as the button from an input", () => {
    const save = vi.fn();
    render(<div onKeyDown={submitOnEnter(save)}><input aria-label="valor" /></div>);
    fireEvent.keyDown(screen.getByLabelText("valor"), { key: "Enter" });
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("respects elements that already handled Enter", () => {
    const save = vi.fn();
    render(<div onKeyDown={submitOnEnter(save)}><input aria-label="tag" onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} /></div>);
    fireEvent.keyDown(screen.getByLabelText("tag"), { key: "Enter" });
    expect(save).not.toHaveBeenCalled();
  });
  it("blocks an empty tag name on Enter with the same error as the button", () => {
    const onRename = vi.fn();
    render(<TagsBoard rows={[{ tag: "fixo", total: 1, count: 1, kinds: ["entradas"], details: [] }]} onAdd={vi.fn()} onRename={onRename} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "editar tag fixo" }));
    const input = screen.getByPlaceholderText("nome da tag");
    fireEvent.change(input, { target: { value: "  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText("dê um nome para a tag.")).toBeInTheDocument();
  });
});

describe("Enter from any field", () => {
  it("saves from a chip button too", () => {
    const save = vi.fn();
    render(<div onKeyDown={submitOnEnter(save)}><button type="button">mensal</button></div>);
    fireEvent.keyDown(screen.getByText("mensal"), { key: "Enter" });
    expect(save).toHaveBeenCalledTimes(1);
  });
});
