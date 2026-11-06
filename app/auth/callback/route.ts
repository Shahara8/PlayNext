import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { callbackFailureUrl, safeRedirectUrl } from "@/lib/auth";

// Lands both the Google OAuth redirect and the email-confirmation link
// (both use Supabase's PKCE flow, which hands back a `?code=` to exchange
// for a session) — one callback covers M5's "both ways" sign-in paths — and
// a password-reset link, which passes `?next=` to land on the new-password
// form instead of the home page.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const failureRedirect = NextResponse.redirect(
    callbackFailureUrl(next, origin),
  );

  if (!code) {
    // Happens when the user cancels the Google consent screen (redirect
    // carries `?error=` instead of `?code=`) or clicks an expired/already-used
    // confirmation link.
    console.error(
      "/auth/callback: no code param present",
      searchParams.get("error_description") ?? searchParams.get("error"),
    );
    return failureRedirect;
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("/auth/callback: exchangeCodeForSession failed", error);
      return failureRedirect;
    }
  } catch (err) {
    console.error("/auth/callback: exchangeCodeForSession threw", err);
    return failureRedirect;
  }

  return NextResponse.redirect(safeRedirectUrl(next, origin));
}
