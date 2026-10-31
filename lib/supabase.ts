import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./supabase-env";

// Public, anon-key client for reading catalog data (title_cache/provider_availability
// via v_catalog, search_titles) — safe to use in Server Components since these tables
// are RLS-readable by anon. Not cookie-aware (unlike lib/supabase-server.ts, added in
// M5) — catalog reads don't need a session, so this stays exactly as M2 built it.
export function createPublicClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createClient(url, anonKey);
}
