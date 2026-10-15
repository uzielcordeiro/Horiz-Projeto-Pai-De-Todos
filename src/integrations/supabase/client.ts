import { createClient } from "@supabase/supabase-js";

// External Supabase project (not Lovable Cloud). The publishable key is safe
// to embed in browser code — Row Level Security protects the data.
const url = import.meta.env['VITE_SUPABASE_URL'] || "https://xqecbciissmdncoyozas.supabase.co";
const key = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] || import.meta.env['VITE_SUPABASE_ANON_KEY'] || "sb_publishable_5sazpNRw7OUJSkKHX-byYA_caSHb-hz";

export const supabaseConfigured = true;

export const supabase = createClient(url, key, {
  auth: {
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});
