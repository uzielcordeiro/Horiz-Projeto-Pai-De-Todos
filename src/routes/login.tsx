import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase, supabaseConfigured } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({
  ssr: false,
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

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return setMsg({ ok: false, text: error.message });
      navigate({ to: "/dashboard", replace: true });
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      setBusy(false);
      if (error) return setMsg({ ok: false, text: error.message });
      if (data.session) navigate({ to: "/dashboard", replace: true });
      else setMsg({ ok: true, text: "Conta criada. Confirme pelo link enviado ao seu e-mail." });
    }
  }

  const input = "h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground outline-none focus:border-primary";
  const tab = (active: boolean) =>
    `flex-1 rounded-md py-2 text-sm font-medium transition-colors ${active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
        <h1 className="mb-6 text-center font-display text-2xl font-semibold text-foreground">HORIZ</h1>
        <div role="tablist" className="mb-6 flex gap-1 rounded-lg bg-muted p-1">
          <button role="tab" type="button" aria-selected={mode === "in"} className={tab(mode === "in")} onClick={() => { setMode("in"); setMsg(null); }}>Entrar</button>
          <button role="tab" type="button" aria-selected={mode === "up"} className={tab(mode === "up")} onClick={() => { setMode("up"); setMsg(null); }}>Cadastrar</button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-2 text-sm text-muted-foreground">
            <span>e-mail</span>
            <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          </label>
          <label className="block space-y-2 text-sm text-muted-foreground">
            <span>senha</span>
            <input required type="password" minLength={6} autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
          </label>
          {msg && <p className={`text-sm ${msg.ok ? "text-foreground" : "text-destructive"}`}>{msg.text}</p>}
          {!supabaseConfigured && <p className="text-sm text-destructive">Conexão com o Supabase ainda não configurada.</p>}
          <Button type="submit" className="w-full" disabled={busy}>{mode === "in" ? "entrar" : "cadastrar"}</Button>
        </form>
      </div>
    </main>
  );
}
