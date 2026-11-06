import type { NextRequest } from "next/server";
import { parseEmailOtpType, RESET_PASSWORD_PATH } from "@/lib/auth";
import { completeAuthRedirect } from "@/lib/auth-redirect";

// Lands the sign-up confirmation email. Its "Confirm signup" template (custom
// SMTP unlocks templates) should read
// `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`, with
// login-form.tsx's `emailRedirectTo: <origin>/auth/confirm`, so a sign-up on
// localhost comes back to localhost. Unlike a PKCE `?code=`, a token hash
// needs no verifier cookie from the browser that asked for it, so the link
// also works in a mail app's built-in browser or on another device.
//
// It also accepts the default template's PKCE `?code=` (what an unedited
// template produces), so the deploy and the template edit can happen in
// either order; that path still needs the original browser's cookie.
//
// Password resets don't come here: they use the implicit flow and land on
// /reset-password directly (see getImplicitFlowClient), which already works
// from any browser, so the Reset Password template stays at its default. A
// `recovery` link that does arrive here still goes to the new-password form.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const type = parseEmailOtpType(searchParams.get("type"));
  // A recovery session always goes to the new-password form, whatever the
  // link says, so a template typo can't strand the user on the home page.
  const next =
    type === "recovery" ? RESET_PASSWORD_PATH : searchParams.get("next");

  let signIn: Parameters<typeof completeAuthRedirect>[3] = null;
  if (tokenHash && type)
    signIn = (supabase) =>
      supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  else if (!tokenHash && code)
    signIn = (supabase) => supabase.auth.exchangeCodeForSession(code);
  else
    console.error("/auth/confirm: missing token_hash/code or bad type", {
      type: searchParams.get("type"),
      // Supabase's own failure (e.g. an expired link) arrives as ?error=.
      error: searchParams.get("error_description") ?? searchParams.get("error"),
    });

  return completeAuthRedirect("/auth/confirm", origin, next, signIn);
}
