import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./supabase-env";

// Cookie-aware client for Client Components — used by the login/signup form
// to call supabase-js auth methods directly from the browser. Writes the
// session to cookies (not localStorage), so the server clients above can
// read the same session on the next request.
export function createBrowserSupabaseClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient(url, anonKey);
}

// For requesting a password-reset email only. @supabase/ssr forces PKCE, and
// a PKCE link only works in the browser holding the verifier cookie — not in
// Gmail's in-app browser. So the reset is requested in implicit flow: the
// default Reset Password template's link lands on /reset-password with the
// session in its #fragment, which works anywhere. (Templates were locked
// before custom SMTP; even with them editable, the reset template is left at
// its default on purpose. Sign-up confirmations use /auth/confirm instead.)
// Stores nothing itself; lib/recovery-link.ts hands the session to the
// cookie-backed client above.
let implicitFlowClient: SupabaseClient | null = null;

export function getImplicitFlowClient() {
  if (implicitFlowClient) return implicitFlowClient;
  const { url, anonKey } = getSupabaseEnv();
  implicitFlowClient = createClient(url, anonKey, {
    auth: {
      flowType: "implicit",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      // Its own key, so it never collides with the cookie-backed client's.
      storageKey: "playnext-implicit-reset",
    },
  });
  return implicitFlowClient;
}
