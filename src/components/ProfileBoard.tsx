import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSignOut } from "@/lib/session";
import { SigningOut } from "@/components/SigningOut";
import { getAccount, saveProfile } from "@/lib/billing.functions";
import { Check, ChevronRight, CircleHelp, FileText, LogOut, Settings, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddWindow } from "@/components/AddWindow";

const OPTIONS = [
  { key: "edit", label: "editar perfil", icon: UserRound },
  { key: "settings", label: "configurações", icon: Settings },
  { key: "help", label: "ajuda", icon: CircleHelp },
  { key: "terms", label: "termos de uso", icon: FileText },
  { key: "privacy", label: "política de privacidade", icon: ShieldCheck },
  { key: "exit", label: "sair", icon: LogOut },
] as const;

type OptionKey = typeof OPTIONS[number]["key"];

const PENDING_TEXT = {
  settings: "As configurações da conta ainda não foram definidas.",
  help: "O conteúdo de ajuda ainda não foi definido.",
  terms: "Os termos de uso ainda não foram disponibilizados.",
  privacy: "A política de privacidade ainda não foi disponibilizada.",
};

export function ProfileBoard() {
  const { signingOut, signOut } = useSignOut();
  const [profile, setProfile] = useState({ name: "", email: "", whatsapp: "" });
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      if (!session) return;

      const sessionEmail = session.user?.email ?? "";
      const sessionName = session.user?.user_metadata?.full_name ?? sessionEmail;

      // Define os dados imediatamente usando a sessão local do Supabase
      setProfile((prev) => ({
        ...prev,
        name: sessionName,
        email: sessionEmail,
      }));

      // Busca dados complementares do servidor sem travar a interface
      try {
        const token = session.access_token;
        if (token) {
          const a = await getAccount({ data: { token } });
          setProfile({
            name: a.full_name || sessionName,
            email: a.email || sessionEmail,
            whatsapp: a.whatsapp || "",
          });
        }
      } catch {
        /* fallback para os dados já carregados da sessão */
      }
    }).catch(() => {});
  }, []);

  const [draft, setDraft] = useState(profile);
  const [selected, setSelected] = useState<OptionKey | null>(null);
  const option = OPTIONS.find((item) => item.key === selected);

  // "sair" fecha a sessão, mostra "Saindo..." por um instante e segue
  // para /login com replace — o Voltar do navegador não reabre a área logada.
  function handleSignOut() {
    setSelected(null);
    void signOut();
  }

  return (
    <section aria-label="Dados do perfil" className="mx-auto w-full max-w-2xl py-2 sm:py-4">
      <div className="mb-7">
        <h2 className="break-words font-display text-3xl font-semibold text-foreground">{profile.name}</h2>
        <p className="mt-1 break-all text-base text-muted-foreground">{profile.email}</p>
        <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground">
          <Check size={16} strokeWidth={2} aria-hidden="true" />
          assinatura ativa
        </span>
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {OPTIONS.map(({ key, label, icon: Icon }) => (
          <Button
            key={key}
            variant="ghost"
            className="h-16 w-full justify-start gap-3 rounded-none px-4 text-left text-base font-medium text-foreground hover:bg-accent/60 sm:px-5"
            onClick={() => { setDraft(profile); setSelected(key); }}
          >
            <Icon size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 whitespace-normal">{label}</span>
            {key !== "exit" && <ChevronRight size={16} strokeWidth={2} className="ml-auto shrink-0 text-muted-foreground" aria-hidden="true" />}
          </Button>
        ))}
      </div>

      {selected && option && (
        <AddWindow title={option.label} onClose={() => setSelected(null)}>
          {selected === "edit" ? (
            <form className="space-y-4" onSubmit={async (event) => {
              event.preventDefault();
              if (!draft.name.trim() || !draft.whatsapp.trim()) return;
              setSaveErr(null);
              try {
                const { data } = await supabase.auth.getSession();
                await saveProfile({ data: { token: data.session?.access_token ?? "", full_name: draft.name.trim(), whatsapp: draft.whatsapp.trim() } });
                setProfile({ ...profile, name: draft.name.trim(), whatsapp: draft.whatsapp.trim() });
                setSelected(null);
              } catch (x) { setSaveErr((x as Error).message); }
            }}>
              <label className="block space-y-2 text-sm text-muted-foreground">
                <span>nome</span>
                <input autoFocus required maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground outline-none focus:border-primary" />
              </label>
              <label className="block space-y-2 text-sm text-muted-foreground">
                <span>WhatsApp</span>
                <input required type="tel" minLength={8} maxLength={20} value={draft.whatsapp} onChange={(event) => setDraft({ ...draft, whatsapp: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground outline-none focus:border-primary" />
              </label>
              {saveErr && <p className="text-sm text-destructive">{saveErr}</p>}
              <Button type="submit" className="w-full">salvar</Button>
            </form>
          ) : selected === "exit" ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Sair da sua conta? Seus lançamentos serão mantidos.</p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setSelected(null)} disabled={signingOut}>cancelar</Button>
                <Button onClick={handleSignOut} disabled={signingOut}>sair</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">{PENDING_TEXT[selected]}</p>
          )}
        </AddWindow>
      )}
      <SigningOut show={signingOut} />
    </section>
  );
}
