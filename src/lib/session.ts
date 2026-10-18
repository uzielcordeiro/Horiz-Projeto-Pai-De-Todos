import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Tempo que o estado "Saindo..." fica na tela antes de trocar para /login.
export const SIGN_OUT_DELAY_MS = 700;

/**
 * Encerra a sessão e devolve o usuário ao login: limpa o cache de queries,
 * mostra "Saindo..." por um instante (evita troca brusca de tela) e então
 * navega com replace — o botão Voltar do navegador não reabre a área logada.
 */
export function useSignOut() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    try { sessionStorage.clear(); } catch { /* ignore */ }
    await new Promise((resolve) => setTimeout(resolve, SIGN_OUT_DELAY_MS));
    navigate({ to: "/login", replace: true });
  }

  return { signingOut, signOut };
}
