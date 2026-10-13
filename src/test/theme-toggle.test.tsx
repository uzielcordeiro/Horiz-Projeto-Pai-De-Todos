import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThemeToggle } from "@/components/ThemeToggle";

describe("global theme", () => {
  it("starts light and alternates the whole document between dark and light", () => {
    render(<ThemeToggle />);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Ativar modo escuro" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Ativar modo claro" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});