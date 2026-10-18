import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parsePlan, type Plan } from "./plans";

export const createCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { plan: Plan; origin: string }) => ({ plan: parsePlan(input.plan), origin: input.origin }))
  .handler(async ({ data, context }) => {
    const secret = process.env['STRIPE_SECRET_KEY'];
    if (!secret) throw new Error("Pagamento indisponível no momento.");
    const request = getRequest();
    const origin = request.headers.get("origin") ?? new URL(request.url).origin;
    if (data.origin !== origin) throw new Error("Origem inválida.");
    const { data: userData, error } = await context.supabase.auth.getUser();
    if (error || !userData.user?.email) throw new Error("Entre na sua conta para assinar.");
    const { startCheckout } = await import("./billing.server");
    try {
      return await startCheckout(secret, userData.user.email, context.userId, data.plan, origin);
    } catch (error) {
      console.error("[checkout] Falha ao abrir sessão", error instanceof Error ? error.message : "unknown");
      throw new Error("Não foi possível abrir o pagamento. Tente novamente em instantes.");
    }
  });