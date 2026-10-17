import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const PLAN_PRICES = {
  monthly: "price_1UQyygIAIPw2F9ku9aP2Bu7G",
  yearly: "price_1UQz0gIAIPw2F9kumCop2W12",
} as const;

async function admin() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env["SUPABASE_URL"] || "https://xqecbciissmdncoyozas.supabase.co";
  const key = process.env["HORIZ_SERVICE_ROLE_KEY"];
  if (!key) throw new Error("HORIZ_SERVICE_ROLE_KEY ausente");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
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
    ? await db.from("subscriptions").update(fields).eq("user_id", userId)
    : await db.from("subscriptions").insert({ user_id: userId, ...fields });
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
  .inputValidator((d: unknown) => tokenSchema.extend({ plan: z.enum(["monthly", "yearly"]), origin: z.string().url() }).parse(d))
  .handler(async ({ data }) => {
    const { user } = await verifyUser(data.token);
    const key = process.env["STRIPE_SECRET_KEY"];
    if (!key) throw new Error("STRIPE_SECRET_KEY ausente");
    // Payment methods are managed in the Stripe Dashboard (dynamic payment methods).
    const p = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": PLAN_PRICES[data.plan],
      "line_items[0][quantity]": "1",
      client_reference_id: user.id,
      "metadata[user_id]": user.id,
      "subscription_data[metadata][user_id]": user.id,
      success_url: `${data.origin}/?checkout=sucesso`,
      cancel_url: `${data.origin}/planos`,
    });
    if (user.email) p.set("customer_email", user.email);
    const res = (await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: p,
    }).then((r) => r.json())) as { url?: string; error?: { message: string } };
    if (!res.url) {
      console.error("Stripe checkout error:", res.error?.message);
      throw new Error(res.error?.message ?? "Falha ao criar checkout");
    }
    return { url: res.url };
  });
