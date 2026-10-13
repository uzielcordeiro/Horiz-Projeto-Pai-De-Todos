import { useState } from "react";
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

export function ProfileBoard({ onExit }: { onExit: () => void }) {
  const [profile, setProfile] = useState({ name: "Uziel", email: "uzivida@gmail.com" });
  const [draft, setDraft] = useState(profile);
  const [selected, setSelected] = useState<OptionKey | null>(null);
  const option = OPTIONS.find((item) => item.key === selected);

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
            <form className="space-y-4" onSubmit={(event) => {
              event.preventDefault();
              if (!draft.name.trim() || !draft.email.trim()) return;
              setProfile({ name: draft.name.trim(), email: draft.email.trim() });
              setSelected(null);
            }}>
              <label className="block space-y-2 text-sm text-muted-foreground">
                <span>nome</span>
                <input autoFocus required maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground outline-none focus:border-primary" />
              </label>
              <label className="block space-y-2 text-sm text-muted-foreground">
                <span>e-mail</span>
                <input required type="email" maxLength={254} value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground outline-none focus:border-primary" />
              </label>
              <p className="text-sm text-muted-foreground">Alterações apenas nesta simulação.</p>
              <Button type="submit" className="w-full">salvar</Button>
            </form>
          ) : selected === "exit" ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Sair do perfil simulado? Seus lançamentos serão mantidos.</p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setSelected(null)}>cancelar</Button>
                <Button onClick={() => { setSelected(null); onExit(); }}>sair</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">{PENDING_TEXT[selected]}</p>
          )}
        </AddWindow>
      )}
    </section>
  );
}