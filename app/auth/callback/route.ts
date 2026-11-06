import type { NextRequest } from "next/server";
import { completeAuthRedirect } from "@/lib/auth-redirect";

// Lands the Google OAuth redirect (Supabase's PKCE flow hands back a
// `?code=` to exchange for a session). Sign-up confirmation emails moved to
// /auth/confirm, but confirmation links already sent before that change
// still point here, so it keeps exchanging any code. It also honors `?next=`
// (same-origin only), which PKCE password-reset links used before resets
// moved to the implicit flow (see getImplicitFlowClient).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code)
    // Happens when the user cancels the Google consent screen (redirect
    // carries `?error=` instead of `?code=`) or clicks an expired/already-used
    // confirmation link.
    console.error(
      "/auth/callback: no code param present",
      searchParams.get("error_description") ?? searchParams.get("error"),
    );

  return completeAuthRedirect(
    "/auth/callback",
    origin,
    searchParams.get("next"),
    code ? (supabase) => supabase.auth.exchangeCodeForSession(code) : null,
  );
}
