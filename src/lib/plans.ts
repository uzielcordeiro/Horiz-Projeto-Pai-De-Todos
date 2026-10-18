export type Plan = "monthly" | "yearly";

export const plans = {
  monthly: { priceId: "price_1UQyygIAIPw2F9ku9aP2Bu7G", amount: 2700, interval: "month" },
  yearly: { priceId: "price_1UQz0gIAIPw2F9kumCop2W12", amount: 30200, interval: "year" },
} as const;

export function parsePlan(value: unknown): Plan {
  if (value !== "monthly" && value !== "yearly") throw new Error("Plano inválido.");
  return value;
}