import { createClient } from "@supabase/supabase-js";

// External Supabase project (not Lovable Cloud). The publishable key is safe
// to embed in browser code — Row Level Security protects the data.
const url = import.meta.env['VITE_SUPABASE_URL'] || "https://xqecbciissmdncoyozas.supabase.co";
const key = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] || import.meta.env['VITE_SUPABASE_ANON_KEY'] || "sb_publishable_5sazpNRw7OUJSkKHX-byYA_caSHb-hz";

export const supabaseConfigured = true;

export const REMEMBER_KEY = "horiz-remember";
export const ACTIVE_KEY = "horiz-active-tab";

export const supabase = createClient(url, key, {
  auth: {
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});

// "Lembrar de mim" desmarcado: encerra a sessão quando o navegador é reaberto.
if (typeof window !== "undefined") {
  try {
    if (localStorage.getItem(REMEMBER_KEY) === "0" && !sessionStorage.getItem(ACTIVE_KEY)) {
      void supabase.auth.signOut({ scope: "local" });
    }
    sessionStorage.setItem(ACTIVE_KEY, "1");
  } catch { /* storage indisponível */ }
}
