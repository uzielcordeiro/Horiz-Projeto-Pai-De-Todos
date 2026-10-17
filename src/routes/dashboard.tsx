import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useSignOut } from "@/lib/session";
import { SigningOut } from "@/components/SigningOut";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [
      { title: "HORIZ Dashboard" },
      { name: "description", content: "Seu painel no HORIZ." },
      { property: "og:title", content: "HORIZ Dashboard" },
      { property: "og:description", content: "Seu painel no HORIZ." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { signingOut, signOut } = useSignOut();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <h1 className="font-display text-3xl font-semibold text-foreground">HORIZ Dashboard</h1>
      <p className="text-muted-foreground">Bem-vindo ao HORIZ</p>
      <Button variant="outline" onClick={() => void signOut()} disabled={signingOut}>Sair</Button>
      <SigningOut show={signingOut} />
    </main>
  );
}
