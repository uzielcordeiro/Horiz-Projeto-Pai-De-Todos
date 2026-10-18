export const PLANS = {
  monthly: { priceId: "price_1UQyygIAIPw2F9ku9aP2Bu7G", amount: 27 },
  yearly: { priceId: "price_1UQz0gIAIPw2F9kumCop2W12", amount: 302 },
} as const;

export type Plan = keyof typeof PLANS;
export function parsePlan(value: unknown): Plan | undefined {
  return value === "monthly" || value === "yearly" ? value : undefined;
}