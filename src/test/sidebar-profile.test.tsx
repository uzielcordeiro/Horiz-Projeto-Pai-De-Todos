import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "@/components/AppSidebar";

describe("profile navigation", () => {
  it("navigates to the profile without triggering financial actions", () => {
    const onNavigate = vi.fn();
    const onAdd = vi.fn();
    const onToday = vi.fn();
    render(<AppSidebar onNavigate={onNavigate} onAdd={onAdd} onToday={onToday} />);
    const profile = screen.getByRole("button", { name: "Conta" });
    fireEvent.click(profile);
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith("perfil");
    expect(onAdd).not.toHaveBeenCalled();
    expect(onToday).not.toHaveBeenCalled();
  });
});