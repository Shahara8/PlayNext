import type { NextRequest } from "next/server";
import { parseEmailOtpType, RESET_PASSWORD_PATH } from "@/lib/auth";
import { completeAuthRedirect } from "@/lib/auth-redirect";

// Lands the links in Supabase's emails. The Reset Password template is
// `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`, where
// RedirectTo is this route on whichever origin asked for the email. Unlike
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
