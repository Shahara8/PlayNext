import type { NextRequest } from "next/server";
import { parseEmailOtpType, RESET_PASSWORD_PATH } from "@/lib/auth";
import { completeAuthRedirect } from "@/lib/auth-redirect";

// Not used by any live email yet. It's for Supabase email links built from a
// custom template, which needs custom SMTP on the free plan (until then,
// resets use the implicit flow and land on /reset-password directly; see
// getImplicitFlowClient). To switch: set the Reset Password template to
// `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery` AND change
// login-form.tsx to the cookie-backed client with
// `redirectTo: <origin>/auth/confirm`, so a reset asked for on localhost comes
// back to localhost. Unlike
// /auth/callback's PKCE `?code=`, a token hash needs no verifier cookie from
// the browser that asked for it, so the link also works in a mail app's
// built-in browser or on another device.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = parseEmailOtpType(searchParams.get("type"));
  // A recovery session always goes to the new-password form, whatever the
  // link says, so a template typo can't strand the user on the home page.
  const next =
    type === "recovery" ? RESET_PASSWORD_PATH : searchParams.get("next");

  if (!tokenHash || !type)
    console.error("/auth/confirm: missing token_hash or bad type", {
      type: searchParams.get("type"),
    });

  return completeAuthRedirect(
    "/auth/confirm",
    origin,
    next,
    tokenHash && type
      ? (supabase) => supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : null,
  );
}
