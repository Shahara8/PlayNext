import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./supabase-env";

// Cookie-aware client for Client Components — used by the login/signup form
// to call supabase-js auth methods directly from the browser. Writes the
// session to cookies (not localStorage), so the server clients above can
// read the same session on the next request.
export function createBrowserSupabaseClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
