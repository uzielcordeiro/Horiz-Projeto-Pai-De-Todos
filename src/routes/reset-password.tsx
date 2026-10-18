import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nova senha — HORIZ" },
      { name: "description", content: "Defina uma nova senha para sua conta HORIZ." },
      { property: "og:title", content: "Nova senha — HORIZ" },
      { property: "og:description", content: "Defina uma nova senha para sua conta HORIZ." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setMsg({ ok: false, text: "As senhas não coincidem." });
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: "Senha atualizada. Entrando…" });
    setTimeout(() => navigate({ to: "/app", replace: true }), 1200);
  }

  const input = "h-11 w-full rounded-lg border border-input bg-background px-3 pr-11 text-foreground outline-none focus:border-primary";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
        <h1 className="mb-2 text-center font-display text-2xl font-semibold text-foreground">Nova senha</h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">Digite e confirme sua nova senha.</p>
        <form onSubmit={submit} className="space-y-4">
          {[{ label: "nova senha", v: password, set: setPassword }, { label: "confirmar senha", v: confirm, set: setConfirm }].map((f) => (
            <label key={f.label} className="block space-y-2 text-sm text-muted-foreground">
              <span>{f.label}</span>
              <div className="relative">
                <input required minLength={6} type={show ? "text" : "password"} autoComplete="new-password" value={f.v} onChange={(e) => f.set(e.target.value)} className={input} />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Ocultar senha" : "Mostrar senha"} aria-pressed={show} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground">
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>
          ))}
          {msg && <p className={`text-sm ${msg.ok ? "text-foreground" : "text-destructive"}`}>{msg.text}</p>}
          <Button type="submit" className="w-full" disabled={busy}>salvar nova senha</Button>
        </form>
      </div>
    </main>
  );
}
