import type { SectionKind } from "@/components/SectionBadge";
import { SECTION_KINDS } from "@/components/SectionBadge";
import { cents } from "./money-format";
import { occurrencesUntil, type Recurrence } from "./recurrence";

export type TagDetail = { date: string; installments: number | null; recurring: boolean };
export type TagRow = { tag: string; total: number; count: number; kinds: SectionKind[]; details: TagDetail[] };
type TaggedEntry = { date: string; amount: number; kind: SectionKind; tags?: string[] };

/** Keep totals across occurrences, but describe each source once rather than each installment. */
export function summarizeTags(entries: TaggedEntry[], recurrences: Recurrence[], untilEnd: string): TagRow[] {
  const map = new Map<string, { total: number; count: number; kinds: Set<SectionKind>; details: TagDetail[] }>();
  const push = (tags: string[] | undefined, amount: number, count: number, kind: SectionKind, detail: TagDetail) => {
    for (const tag of new Set(tags ?? [])) {
      const row = map.get(tag) ?? { total: 0, count: 0, kinds: new Set<SectionKind>(), details: [] };
      row.total = cents(row.total + amount);
      row.count += count;
      row.kinds.add(kind);
      if (!row.details.some((item) => item.date === detail.date && item.installments === detail.installments && item.recurring === detail.recurring)) {
        row.details.push(detail);
      }
      map.set(tag, row);
    }
  };
  for (const entry of entries) {
    push(entry.tags, entry.amount, 1, entry.kind, { date: entry.date, installments: null, recurring: false });
  }
  for (const recurrence of recurrences) {
    if (!recurrence.tags?.length) continue;
    const occurrences = occurrencesUntil(recurrence, recurrence.installments != null ? "9999-12-31" : untilEnd);
    if (!occurrences.length) continue;
    push(recurrence.tags, occurrences.reduce((sum, item) => cents(sum + item.amount), 0), occurrences.length, recurrence.kind, {
      date: recurrence.startDate,
      installments: recurrence.installments,
      recurring: true,
    });
  }
  return Array.from(map, ([tag, row]) => ({
    tag, total: row.total, count: row.count,
    kinds: SECTION_KINDS.filter((kind) => row.kinds.has(kind)),
    details: row.details.sort((a, b) => a.date.localeCompare(b.date)),
  }));
}