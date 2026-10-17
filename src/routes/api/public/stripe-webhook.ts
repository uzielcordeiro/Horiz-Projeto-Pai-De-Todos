import { createFileRoute } from "@tanstack/react-router";

async function verify(body: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  const t = parts["t"];
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${t}.${body}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => s.length === hex.length && [...s].reduce((a, c, i) => a | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
}

const iso = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null);

async function stripeGet(path: string) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${process.env["STRIPE_SECRET_KEY"]}` } });
  return r.json() as Promise<any>;
}

function subFields(sub: any) {
  const item = sub.items?.data?.[0];
  return {
    status: sub.status,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
    stripe_subscription_id: sub.id,
    price_id: item?.price?.id ?? null,
    current_period_start: iso(sub.current_period_start ?? item?.current_period_start),
    current_period_end: iso(sub.current_period_end ?? item?.current_period_end),
  };
}

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_WEBHOOK_SECRET"];
        const body = await request.text();
        if (!secret || !(await verify(body, request.headers.get("stripe-signature"), secret)))
          return new Response("Invalid signature", { status: 400 });

        const event = JSON.parse(body);
        const { billingAdmin, upsertByUser } = await import("@/lib/billing.functions");
        const db = await billingAdmin();
        const obj = event.data?.object ?? {};

        if (event.type === "checkout.session.completed") {
          const userId = obj.client_reference_id ?? obj.metadata?.user_id;
          if (!userId) return new Response("ok");
          const fields: Record<string, unknown> = {
            stripe_customer_id: obj.customer,
            amount_paid: obj.amount_total != null ? obj.amount_total / 100 : null,
            payment_method_type: obj.payment_method_types?.[0] ?? null,
            status: obj.payment_status === "paid" ? "active" : "incomplete",
          };
          if (obj.subscription) {
            const sub = await stripeGet(`subscriptions/${obj.subscription}?expand[]=default_payment_method`);
            Object.assign(fields, subFields(sub));
            if (sub.default_payment_method?.type) fields["payment_method_type"] = sub.default_payment_method.type;
          }
          await upsertByUser(db, userId, fields);
        } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
          const fields = subFields(obj);
          if (event.type === "customer.subscription.deleted") fields.status = "canceled" as string;
          let userId: string | undefined = obj.metadata?.user_id;
          if (!userId) {
            const { data } = await db.from("subscriptions").select("user_id").eq("stripe_subscription_id", obj.id).maybeSingle();
            userId = data?.user_id;
          }
          if (userId) await upsertByUser(db, userId, fields);
        }
        return new Response("ok");
      },
    },
  },
});
