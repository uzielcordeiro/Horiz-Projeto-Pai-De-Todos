import { plans, type Plan } from "./plans";

async function stripeRequest<T>(secret: string, path: string, body?: URLSearchParams): Promise<T> {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${secret}`, "Stripe-Version": "2025-08-27.basil", ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body,
  });
  if (!response.ok) throw new Error(`Stripe ${response.status}`);
  return response.json() as Promise<T>;
}

export async function startCheckout(secret: string, email: string, userId: string, plan: Plan, origin: string) {
  const customers = await stripeRequest<{ data: { id: string }[] }>(secret, `customers?email=${encodeURIComponent(email)}&limit=100`);
  for (const customer of customers.data) {
    const subscriptions = await stripeRequest<{ data: { status: string; items: { data: { price: { id: string } }[] } }[] }>(secret, `subscriptions?customer=${customer.id}&status=all&limit=100`);
    if (subscriptions.data.some(s => ["active", "trialing", "past_due"].includes(s.status) && s.items.data.some(i => Object.values(plans).some(p => p.priceId === i.price.id)))) {
      throw new Error("Assinatura já existente");
    }
  }
  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": plans[plan].priceId,
    "line_items[0][quantity]": "1",
    client_reference_id: userId,
    "subscription_data[metadata][user_id]": userId,
    success_url: `${origin}/login?checkout=success`,
    cancel_url: `${origin}/#planos`,
  });
  const customer = customers.data[0];
  if (customer) body.set("customer", customer.id);
  else body.set("customer_email", email);
  const session = await stripeRequest<{ url: string | null }>(secret, "checkout/sessions", body);
  if (!session.url || new URL(session.url).hostname !== "checkout.stripe.com") throw new Error("Checkout sem URL válida");
  return { url: session.url };
}