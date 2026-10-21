import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PLANS } from "@/lib/plans";

export const PLAN_PRICES = {
  monthly: PLANS.monthly.priceId,
  yearly: PLANS.yearly.priceId,
} as const;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function verifyUser(token: string) {
  const db = await admin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error("Não autenticado");
  return { db, user: data.user };
}

async function upsertByUser(db: Awaited<ReturnType<typeof admin>>, userId: string, fields: Record<string, unknown>) {
  const { data } = await db.from("subscriptions").select("user_id").eq("user_id", userId).maybeSingle();
  const res = data
    ? await db.from("subscriptions").update(fields as never).eq("user_id", userId)
    : await db.from("subscriptions").insert({ user_id: userId, ...fields } as never);
  if (res.error) throw new Error(res.error.message);
}
export { admin as billingAdmin, upsertByUser };

const tokenSchema = z.object({ token: z.string().min(10) });

export const getAccount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { db, user } = await verifyUser(data.token);
    let { data: row } = await db.from("subscriptions").select("status, full_name, whatsapp").eq("user_id", user.id).maybeSingle();
    const meta = user.user_metadata ?? {};
    if (!row?.full_name && (meta["full_name"] || meta["whatsapp"])) {
      await upsertByUser(db, user.id, { full_name: meta["full_name"] ?? null, whatsapp: meta["whatsapp"] ?? null });
      row = { status: row?.status ?? null, full_name: meta["full_name"] ?? null, whatsapp: meta["whatsapp"] ?? null };
    }
    return { user_id: user.id, email: user.email ?? "", status: (row?.status as string | null) ?? null, full_name: (row?.full_name as string | null) ?? "", whatsapp: (row?.whatsapp as string | null) ?? "" };
  });

export type Account = Awaited<ReturnType<typeof getAccount>>;

export const saveProfile = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    tokenSchema.extend({ full_name: z.string().trim().min(1).max(80), whatsapp: z.string().trim().min(8).max(20) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { db, user } = await verifyUser(data.token);
    await upsertByUser(db, user.id, { full_name: data.full_name, whatsapp: data.whatsapp });
    await db.auth.admin.updateUserById(user.id, { user_metadata: { full_name: data.full_name, whatsapp: data.whatsapp } });
    return { ok: true };
  });

export const createCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(10).optional(), plan: z.enum(["monthly", "yearly"]), origin: z.string().url() }).parse(d))
  .handler(async ({ data }) => {
    const user = data.token ? (await verifyUser(data.token)).user : undefined;
    const key = process.env["STRIPE_SECRET_KEY"];
    if (!key) throw new Error("STRIPE_SECRET_KEY ausente");

    const successUrl = user?.email
      ? `${data.origin}/login?tab=register&email=${encodeURIComponent(user.email)}`
      : `${data.origin}/login?tab=register&session_id={CHECKOUT_SESSION_ID}`;

    const p = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": PLAN_PRICES[data.plan],
      "line_items[0][quantity]": "1",
      success_url: successUrl,
      cancel_url: `${data.origin}/#planos`,
    });
    if (user) {
      p.set("client_reference_id", user.id);
      p.set("metadata[user_id]", user.id);
      p.set("subscription_data[metadata][user_id]", user.id);
      if (user.email) p.set("customer_email", user.email);
    }
    const res = (await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: p,
    }).then((r) => r.json())) as { url?: string; error?: { message: string } };
    if (!res.url) {
      console.error("Stripe checkout error:", res.error?.message);
      throw new Error("Não foi possível abrir o pagamento. Tente novamente em instantes.");
    }
    return { url: res.url };
  });

export const getCheckoutSessionEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().min(5) }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env["STRIPE_SECRET_KEY"];
    if (!key) throw new Error("STRIPE_SECRET_KEY ausente");

    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${data.sessionId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
    }).then((r) => r.json()) as { customer_details?: { email?: string }; customer_email?: string; error?: { message: string } };

    if (res.error) {
      throw new Error(res.error.message);
    }

    const email = res.customer_details?.email || res.customer_email || "";
    return { email };
  });

export const activatePendingSubscription = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(10).optional(), sessionId: z.string().min(5).optional() }).parse(d))
  .handler(async ({ data }) => {
    if (!data.sessionId) return { activated: false };

    const key = process.env["STRIPE_SECRET_KEY"];
    if (!key) return { activated: false };

    const db = await admin();

    try {
      const session = await fetch(`https://api.stripe.com/v1/checkout/sessions/${data.sessionId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${key}` },
      }).then((r) => r.json()) as { 
        payment_status?: string; 
        subscription?: string; 
        customer?: string; 
        client_reference_id?: string;
        customer_details?: { email?: string };
        customer_email?: string;
      };

      if (session.payment_status === "paid" && session.subscription) {
        let targetUserId = session.client_reference_id;

        if (!targetUserId) {
          const email = session.customer_details?.email || session.customer_email;
          if (email) {
            const { data: profileByEmail } = await db.from("subscriptions").select("user_id").eq("email", email.trim()).maybeSingle();
            if (profileByEmail?.user_id) {
              targetUserId = profileByEmail.user_id;
            } else if (data.token) {
              try {
                const verified = await verifyUser(data.token);
                targetUserId = verified.user.id;
              } catch { /* ignora */ }
            }
          }
        }

        if (targetUserId) {
          await upsertByUser(db, targetUserId, {
            status: "active",
            stripe_customer_id: session.customer ?? null,
            stripe_subscription_id: session.subscription,
          });
          return { activated: true };
        }
      }
    } catch (err) {
      console.error("Erro ao ativar assinatura pendente:", err);
    }
    return { activated: false };
  });
