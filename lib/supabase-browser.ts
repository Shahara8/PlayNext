import { createBrowserClient } from "@supabase/ssr";

// Cookie-aware client for Client Components — used by the login/signup form
// to call supabase-js auth methods directly from the browser. Writes the
// session to cookies (not localStorage), so the server clients above can
// read the same session on the next request.
export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set",
    );
  }
  return createBrowserClient(url, anonKey);
}
