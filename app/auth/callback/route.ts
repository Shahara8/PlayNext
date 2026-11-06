import type { NextRequest } from "next/server";
import { completeAuthRedirect } from "@/lib/auth-redirect";

// Lands both the Google OAuth redirect and the email-confirmation link
// (both use Supabase's PKCE flow, which hands back a `?code=` to exchange
// for a session) — one callback covers M5's "both ways" sign-in paths — and
// password-reset links sent before the template moved them to /auth/confirm,
// which pass `?next=` to land on the new-password form.
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
