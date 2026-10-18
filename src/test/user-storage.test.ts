import { beforeEach, expect, it } from "vitest";
import { adoptLegacyKeys, userKey } from "@/lib/user-storage";

beforeEach(() => localStorage.clear());

it("a second account never sees the first account's data", () => {
  localStorage.setItem("timeline-entries-v1", "[1]");
  adoptLegacyKeys("A", ["timeline-entries-v1"]);
  adoptLegacyKeys("B", ["timeline-entries-v1"]);
  expect(localStorage.getItem(userKey("A", "timeline-entries-v1"))).toBe("[1]");
  expect(localStorage.getItem(userKey("B", "timeline-entries-v1"))).toBeNull();
  expect(localStorage.getItem("timeline-entries-v1")).toBeNull();
});
