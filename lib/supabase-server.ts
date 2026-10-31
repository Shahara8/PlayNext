import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cookie-aware client for Server Components, Route Handlers, and Server
// Actions — reads/refreshes the auth session via request cookies. Server
// Components can't write cookies (Next.js throws), so `setAll` is a no-op
// there; `middleware.ts` is what actually keeps the session cookie fresh.
export async function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set",
    );
  }

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
