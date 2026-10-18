import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { loadAccount } from "@/lib/access";
import { createCheckout, saveProfile } from "@/lib/billing.functions";
import { useSignOut } from "@/lib/session";
import { SigningOut } from "@/components/SigningOut";

export const Route = createFileRoute("/planos")({
  ssr: false,
  beforeLoad: async () => {
    const res = await loadAccount();
    if (res.account.status === "active") throw redirect({ to: "/app" });
    return res;
  },
  head: () => ({
    meta: [
      { title: "Planos — HORIZ" },
      { name: "description", content: "Escolha o plano mensal ou anual do HORIZ." },
      { property: "og:title", content: "Planos — HORIZ" },
      { property: "og:description", content: "Escolha o plano mensal ou anual do HORIZ." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlansPage,
});

/**
 * Extrai a URL de pagamento de qualquer formato de resposta do createCheckout
 * (url, checkoutUrl, data.url ou data.checkoutUrl). Lança se nada vier.
 */
export function checkoutUrlFrom(response: unknown): string {
  const r = response as { url?: unknown; checkoutUrl?: unknown; data?: { url?: unknown; checkoutUrl?: unknown } };
  const url = [r?.url, r?.checkoutUrl, r?.data?.url, r?.data?.checkoutUrl]
    .find((v): v is string => typeof v === "string" && v.trim().length > 0);
  if (!url) throw new Error("URL de pagamento não retornada pelo servidor.");
  return url;
}


function PlansPage() {
  const { token, account } = Route.useRouteContext();
  const { signingOut, signOut } = useSignOut();
  const [name, setName] = useState(account.full_name);
  const [whats, setWhats] = useState(account.whatsapp);
  const [hasProfile, setHasProfile] = useState(!!(account.full_name && account.whatsapp));
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy("profile"); setErr(null);
    try { await saveProfile({ data: { token, full_name: name, whatsapp: whats } }); setHasProfile(true); }
    catch (x) { setErr((x as Error).message); }
    setBusy(null);
  }
  const [loadingPlan, setLoadingPlan] = useState<"monthly" | "yearly" | null>(null);
  useEffect(() => {
    const reset = () => setLoadingPlan(null);
    window.addEventListener("pageshow", reset);
    window.addEventListener("focus", reset);
    return () => { window.removeEventListener("pageshow", reset); window.removeEventListener("focus", reset); };
  }, []);
  async function subscribe(plan: "monthly" | "yearly") {
    if (loadingPlan) return;
    setLoadingPlan(plan); setErr(null);
    try {
      const response = await createCheckout({ data: { token, plan, origin: window.location.origin } });
      // Aceita qualquer nome de propriedade retornado pela Edge Function: url, checkoutUrl, data.url ou data.checkoutUrl.
      const checkoutUrl = (response as any)?.url || (response as any)?.checkoutUrl || (response as any)?.data?.url || (response as any)?.data?.checkoutUrl;
      if (!checkoutUrl) {
        throw new Error("URL de pagamento não retornada pelo servidor.");
      }
      window.location.href = checkoutUrl;
    }
    catch (x) { setErr((x as Error).message); setLoadingPlan(null); }
  }
  const input = "h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground outline-none focus:border-primary";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <h1 className="font-display text-3xl font-semibold text-foreground">Escolha seu plano</h1>
          <p className="mt-2 text-muted-foreground">Assine para liberar o HORIZ.</p>
        </div>
        {!hasProfile ? (
          <form onSubmit={save} className="mx-auto max-w-sm space-y-4 rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">Antes, complete seus dados.</p>
            <label className="block space-y-2 text-sm text-muted-foreground"><span>nome completo</span>
              <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={input} /></label>
            <label className="block space-y-2 text-sm text-muted-foreground"><span>WhatsApp</span>
              <input required type="tel" minLength={8} maxLength={20} placeholder="(69) 99999-9999" value={whats} onChange={(e) => setWhats(e.target.value)} className={input} /></label>
            <Button type="submit" className="w-full" disabled={busy !== null}>continuar</Button>
          </form>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              ["monthly", "Plano Mensal", "R$ 27,00", "/ mês", "cobrado todo mês"],
              ["yearly", "Plano Anual", "R$ 302,00", "/ ano", "equivale a R$ 25,17/mês, cobrado anualmente"],
            ] as const).map(([k, t, price, per, d]) => (
              <div key={k} className="flex flex-col rounded-xl border border-border bg-card p-6">
                <h2 className="font-display text-xl font-semibold text-foreground">{t}</h2>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="font-display text-4xl font-bold text-primary">{price}</span>
                  <span className="text-base text-muted-foreground">{per}</span>
                </p>
                <p className="mb-6 mt-1 text-sm text-muted-foreground">{d}</p>
                <Button className="mt-auto w-full" disabled={loadingPlan === k} onClick={() => subscribe(k)}>
                  {loadingPlan === k ? "abrindo…" : "assinar"}
                </Button>
              </div>
            ))}
          </div>
        )}
        {err && <p className="text-center text-sm text-destructive">{err}</p>}
        <div className="text-center">
          <Button variant="ghost" onClick={() => void signOut()} disabled={signingOut}>sair</Button>
        </div>
      </div>
      <SigningOut show={signingOut} />
    </main>
  );
}
