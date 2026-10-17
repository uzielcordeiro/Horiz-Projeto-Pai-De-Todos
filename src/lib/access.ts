import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getAccount, type Account } from "@/lib/billing.functions";

/**
 * Estado de acesso decidido SEM redirecionar: serve tanto para as páginas que
 * precisam trocar de rota quanto para a página raiz, que precisa mostrar o
 * carregamento antes de navegar (redirecionar durante a hidratação quebra o
 * render do React).
 *
 * - "signed-out": não há sessão (getSession) ou a sessão salva já não é válida.
 * - "inactive":   entrou, mas a assinatura ainda não está ativa.
 * - "active":     entrou e a assinatura está ativa.
 */
export type Access =
  | { kind: "signed-out" }
  | { kind: "inactive"; token: string; account: Account }
  | { kind: "active"; token: string; account: Account };

/** Erros que significam "esta sessão salva não vale mais" — outros erros estouram. */
function isExpiredSession(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /não autenticado|unauthorized|invalid token|jwt expired|invalid jwt/i.test(message);
}

export async function checkAccess(): Promise<Access> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { kind: "signed-out" };
  let account: Account;
  try {
    account = await getAccount({ data: { token } });
  } catch (error) {
    if (isExpiredSession(error)) return { kind: "signed-out" };
    throw error;
  }
  return account.status === "active"
    ? { kind: "active", token, account }
    : { kind: "inactive", token, account };
}

export async function loadAccount() {
  const res = await checkAccess();
  if (res.kind === "signed-out") throw redirect({ to: "/login" });
  return res;
}

/** Blocks the platform unless the signed-in user's subscription is active. */
export async function requireActiveSubscription() {
  const res = await loadAccount();
  if (res.kind !== "active") throw redirect({ to: "/planos" });
  return res;
}
