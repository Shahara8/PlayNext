import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "./supabase-server";
import { callbackFailureUrl, safeRedirectUrl } from "./auth";

/**
 * The shared end of /auth/callback and /auth/confirm: runs `signIn` (the
 * code exchange or token verification that sets the session cookie), then
 * redirects to `next` on success or to /login's matching error otherwise.
 * `signIn` null means the link was malformed. `label` prefixes log lines.
 */
export async function completeAuthRedirect(
  label: string,
  origin: string,
  next: string | null,
  signIn: ((supabase: SupabaseClient) => Promise<{ error: unknown }>) | null,
): Promise<NextResponse> {
  const failure = () => NextResponse.redirect(callbackFailureUrl(next, origin));
  if (!signIn) return failure();

  try {
    const { error } = await signIn(await createServerSupabaseClient());
    if (error) {
      console.error(`${label}: sign-in failed`, error);
      return failure();
    }
  } catch (err) {
    console.error(`${label}: sign-in threw`, err);
    return failure();
  }

  return NextResponse.redirect(safeRedirectUrl(next, origin));
}
