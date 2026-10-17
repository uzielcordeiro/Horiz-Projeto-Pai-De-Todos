import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { checkAccess } = vi.hoisted(() => ({ checkAccess: vi.fn() }));
vi.mock("@/lib/access", () => ({ checkAccess, loadAccount: vi.fn(), requireActiveSubscription: vi.fn() }));

import { routeTree } from "@/routeTree.gen";

describe("debug", () => {
  it("prints router state", async () => {
    checkAccess.mockResolvedValue({ kind: "active", token: "t", account: { user_id: "u1", email: "e", status: "active", full_name: "U", whatsapp: "w" } });
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() }, history: createMemoryHistory({ initialEntries: ["/"] }) });
    render(<RouterProvider router={router} />);
    await new Promise((r) => setTimeout(r, 300));
    console.log("STATUS:", router.state.status, "MATCHES:", router.state.matches.map((m) => m.routeId + ":" + m.status));
    console.log("BODY:", document.body.innerHTML.slice(0, 300));
    expect(true).toBe(true);
  });
});
