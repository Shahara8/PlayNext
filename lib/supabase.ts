import { createClient } from "@supabase/supabase-js";

// Public, anon-key client for reading catalog data (title_cache/provider_availability
// via v_catalog, search_titles) — safe to use in Server Components since these tables
// are RLS-readable by anon. No auth/session handling yet (that's M5); once auth lands,
// a separate cookie-aware server client will be added alongside this one.
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set",
    );
  }
  return createClient(url, anonKey);
}
