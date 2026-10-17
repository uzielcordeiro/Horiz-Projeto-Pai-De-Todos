import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getAccount } from "@/lib/billing.functions";

export async function loadAccount() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw redirect({ to: "/login" });
  return { token, account: await getAccount({ data: { token } }) };
}

/** Blocks the platform unless the signed-in user's subscription is active. */
export async function requireActiveSubscription() {
  const res = await loadAccount();
  if (res.account.status !== "active") throw redirect({ to: "/planos" });
  return res;
}
