import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseConfigured, REMEMBER_KEY } from "@/integrations/supabase/extras";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import { parsePlan, type Plan } from "@/lib/plans";
import { createCheckout, getCheckoutSessionEmail, activatePendingSubscription } from "@/lib/billing.functions";
import { useServerFn } from "@tanstack/react-start";

const REMEMBERED_EMAIL_KEY = "remembered_email";
const LEGACY_EMAIL_KEY = "horiz-last-email";
const SUPPORT_EMAIL = "suporte@horiz.app";

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { plan?: Plan; tab?: string; email?: string; session_id?: string } => {
    const plan = parsePlan(search["plan"]);
    const tab = typeof search["tab"] === "string" ? search["tab"] : undefined;
    const email = typeof search["email"] === "string" ? search["email"] : undefined;
    const session_id = typeof search["session_id"] === "string" ? search["session_id"] : undefined;
    return { ...(plan ? { plan } : {}), ...(tab ? { tab } : {}), ...(email ? { email } : {}), ...(session_id ? { session_id } : {}) };
  },
  head: () => ({
    meta: [
      { title: "Entrar — HORIZ" },
      { name: "description", content: "Entre ou crie sua conta no HORIZ." },
      { property: "og:title", content: "Entrar — HORIZ" },
      { property: "og:description", content: "Entre ou crie sua conta no HORIZ." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

export function LoginPage() {
  const navigate = useNavigate();
  const checkout = useServerFn(createCheckout);
  const fetchSessionEmail = useServerFn(getCheckoutSessionEmail);
  const activateSub = useServerFn(activatePendingSubscription);

  const [selectedPlan, setSelectedPlan] = useState<Plan | undefined>();
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [fullName, setFullName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSelectedPlan(parsePlan(params.get("plan")));

    const urlTab = params.get("tab");
    const rawEmail = params.get("email");
    const sessionId = params.get("session_id");

    // Captura e salva UTMs da URL no localStorage de forma silenciosa
    const utmParams = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
    utmParams.forEach((param) => {
      const val = params.get(param);
      if (val) localStorage.setItem(`horiz_${param}`, val);
    });

    const isCheckoutFlow =
      urlTab === "register" ||
      urlTab === "up" ||
      urlTab === "cadastrar" ||
      !!sessionId ||
      !!rawEmail;

    if (isCheckoutFlow) {
      supabase.auth.signOut().catch(() => {});
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          enterApp(session.access_token, sessionId);
          return;
        }
      });
    }

    if (urlTab === "register" || urlTab === "up" || urlTab === "cadastrar") {
      setMode("up");
    } else if (urlTab === "login" || urlTab === "in" || urlTab === "entrar") {
      setMode("in");
    }

    if (rawEmail) {
      try {
        setEmail(decodeURIComponent(rawEmail).trim());
      } catch {
        setEmail(rawEmail.trim());
      }
    } else if (sessionId) {
      setBusy(true);
      fetchSessionEmail({ data: { sessionId } })
        .then((res) => {
          if (res?.email) {
            setEmail(res.email.trim());
          }
        })
        .catch(() => {})
        .finally(() => {
          setBusy(false);
        });
    } else {
      try {
        const saved = localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? localStorage.getItem(LEGACY_EMAIL_KEY);
        if (saved) {
          setEmail(saved);
          localStorage.setItem(REMEMBERED_EMAIL_KEY, saved);
          localStorage.removeItem(LEGACY_EMAIL_KEY);
        }
      } catch { /* ignore */ }
    }

    setRemember(localStorage.getItem(REMEMBER_KEY) !== "0");
  }, [fetchSessionEmail]);

  function switchMode(m: typeof mode) { setMode(m); setMsg(null); }

  async function enterApp(token?: string, sessionIdToActivate?: string) {
    setBusy(true);
    try {
      const activeSessionId = sessionIdToActivate || new URLSearchParams(window.location.search).get("session_id");
      if (activeSessionId) {
        try {
          await activateSub({ data: { sessionId: activeSessionId } });
        } catch {
          // Continua mesmo se houver falha na ativação síncrona
        }
      }

      if (!selectedPlan || !token) {
        await navigate({ to: "/app", replace: true });
        return;
      }

      const { url } = await checkout({ data: { token, plan: selectedPlan, origin: window.location.origin } });
      window.location.assign(url);
    } catch {
      setMsg({ ok: false, text: "Erro ao processar redirecionamento. Tente novamente." });
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id") || undefined;

    if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      setBusy(false);
      if (error) return setMsg({ ok: false, text: error.message });
      return setMsg({ ok: true, text: "Se o e-mail estiver cadastrado, você receberá um link para redefinição." });
    }

    if (mode === "in") {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return setMsg({ ok: false, text: error.message });
      try {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
        localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
      } catch { /* ignore */ }
      
      if (data?.session) {
        await enterApp(data.session.access_token, sessionId);
      }
    } else {
      // Puxa as UTMs do armazenamento local para enviar ao Supabase
      const utms = {
        utm_source: localStorage.getItem("horiz_utm_source") || undefined,
        utm_medium: localStorage.getItem("horiz_utm_medium") || undefined,
        utm_campaign: localStorage.getItem("horiz_utm_campaign") || undefined,
        utm_content: localStorage.getItem("horiz_utm_content") || undefined,
        utm_term: localStorage.getItem("horiz_utm_term") || undefined,
      };

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { 
          data: { 
            full_name: fullName.trim(), 
            whatsapp: whatsapp.trim(),
            ...utms
          }, 
          emailRedirectTo: `${window.location.origin}/login?tab=login&email=${encodeURIComponent(email)}${sessionId ? `&session_id=${sessionId}` : ""}` 
        },
      });
      setBusy(false);
      if (error) return setMsg({ ok: false, text: error.message });
      try { localStorage.setItem(REMEMBERED_EMAIL_KEY, email); } catch { /* ignore */ }

      if (data.session) {
        await enterApp(data.session.access_token, sessionId);
      } else {
        setMsg({ ok: true, text: "Cadastro realizado com sucesso! Verifique o link enviado para o seu e-mail." });
      }
    }
  }

  const input = "h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground outline-none focus:border-primary";
  const tab = (active: boolean) =>
    `flex-1 rounded-md py-2 text-sm font-semibold transition-colors ${active ? "bg-primary text-primary-foreground shadow-sm" : "bg-transparent text-muted-foreground hover:bg-input/80 hover:text-foreground"}`;
  const link = "text-sm text-primary underline-offset-4 hover:underline";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
        <h1 className="mb-6 text-center font-display text-2xl font-semibold text-foreground">HORIZ</h1>
        {mode !== "forgot" ? (
          <div role="tablist" className="mb-6 flex gap-1 rounded-lg bg-input/50 p-1">
            <button role="tab" type="button" aria-selected={mode === "in"} className={tab(mode === "in")} onClick={() => switchMode("in")}>Entrar</button>
            <button role="tab" type="button" aria-selected={mode === "up"} className={tab(mode === "up")} onClick={() => switchMode("up")}>Cadastrar</button>
          </div>
        ) : (
          <div className="mb-6 space-y-1 text-center">
            <h2 className="font-medium text-foreground">Esqueci minha senha</h2>
            <p className="text-sm text-muted-foreground">Informe seu e-mail para receber o link de redefinição.</p>
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          {mode === "up" && (<>
            <label className="block space-y-2 text-sm text-muted-foreground">
              <span>nome completo</span>
              <input required maxLength={80} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={input} />
            </label>
            <label className="block space-y-2 text-sm text-muted-foreground">
              <span>WhatsApp</span>
              <input required type="tel" minLength={8} maxLength={20} autoComplete="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className={input} />
            </label>
          </>)}
          <label className="block space-y-2 text-sm text-muted-foreground">
            <span>e-mail</span>
            <input required type="email" name="email" autoComplete="username email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          </label>
          {mode !== "forgot" && (
            <label className="block space-y-2 text-sm text-muted-foreground">
              <span>senha</span>
              <div className="relative">
                <input required name="password" type={showPass ? "text" : "password"} minLength={6} autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} className={`${input} pr-11`} />
                <button type="button" onClick={() => setShowPass((v) => !v)} aria-label={showPass ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPass} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground">
                  {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>
          )}
          {mode === "in" && (
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={remember} onChange={(e) => {
                  const on = e.target.checked;
                  setRemember(on);
                  try {
                    if (on) { if (email.trim()) localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim()); }
                    else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
                  } catch { /* ignore */ }
                }} className="size-4 accent-primary" />
                Lembrar de mim
              </label>
              <button type="button" className={link} onClick={() => switchMode("forgot")}>Esqueci minha senha</button>
            </div>
          )}
          {msg && (
            <div className={`rounded-lg border p-3 text-sm ${msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
              {msg.text}
            </div>
          )}
          {!supabaseConfigured && <p className="text-sm text-destructive">Conexão com o Supabase ainda não configurada.</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "in" ? "entrar" : mode === "up" ? "cadastrar" : "enviar link"}
          </Button>
          {mode === "forgot" && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                Não lembra qual e-mail cadastrou?{" "}
                <a className={link} href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Não lembro meu e-mail no HORIZ")}`}>Fale com o suporte</a>
              </p>
              <button type="button" className={link} onClick={() => switchMode("in")}>Voltar para entrar</button>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}
