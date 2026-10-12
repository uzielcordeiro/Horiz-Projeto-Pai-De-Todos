import { describe, expect, it } from "vitest";
import { dayBefore } from "@/lib/recurrence";
describe("apagar deste dia em diante", () => {
  it("termina exatamente no dia anterior", () => {
    expect(dayBefore("2026-10-12")).toBe("2026-10-11");
    expect(dayBefore("2026-03-01")).toBe("2026-02-28");
    expect(dayBefore("2027-01-01")).toBe("2026-12-31");
  });
});
