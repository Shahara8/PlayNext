import { cache } from "react";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./supabase-env";

// Cookie-aware client for Server Components, Route Handlers, and Server
// Actions — reads/refreshes the auth session via request cookies. Server
// Components can't write cookies (Next.js throws), so `setAll` is a no-op
// there; `middleware.ts` is what actually keeps the session cookie fresh.
export async function createServerSupabaseClient() {
  const { url, anonKey } = getSupabaseEnv();

  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — no-op, middleware refreshes it.
        }
      },
    },
  });
}

// Wrapped in React's `cache()` so the handful of places that need "is anyone
// signed in" within one request (Header's AuthNav, a page's own redirect
// check) share a single auth.getUser() round trip instead of each making
// their own. `connection()` lives here (not just in AuthNav) because
// supabase-js's getUser() calls Date.now() internally, which cacheComponents
// flags as an "unstable value" unless the component has already been marked
// dynamic — see docs/MVP.md's M5 progress log for the full story.
export const getCurrentUser = cache(async () => {
  await connection();
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});
