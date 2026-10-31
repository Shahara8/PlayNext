import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { AUTH_CALLBACK_ERROR_PARAM } from "@/lib/auth";

// Lands both the Google OAuth redirect and the email-confirmation link
// (both use Supabase's PKCE flow, which hands back a `?code=` to exchange
// for a session) — one callback covers M5's "both ways" sign-in paths.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const failureRedirect = NextResponse.redirect(
    `${origin}/login?error=${AUTH_CALLBACK_ERROR_PARAM}`,
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

  return NextResponse.redirect(`${origin}/`);
}
