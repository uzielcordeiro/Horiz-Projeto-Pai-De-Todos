import { SigningOut } from "@/components/SigningOut";
import { Button } from "@/components/ui/button";
import { useSignOut } from "@/lib/session";

/**
 * Botão "Sair da conta" das telas de bloqueio (sem plano / acesso suspenso).
 * Usa o mesmo caminho de saída do resto do app (useSignOut): limpa os dados guardados,
 * mostra "Saindo..." e leva para o login sem deixar o Voltar reabrir a área logada.
 */
export function BotaoSairDaConta() {
  const { signingOut, signOut } = useSignOut();
  return (
    <>
      <Button
        variant="ghost"
        onClick={() => void signOut()}
        disabled={signingOut}
        className="h-12 w-full rounded-xl text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        Sair da conta
      </Button>
      <SigningOut show={signingOut} />
    </>
  );
}
