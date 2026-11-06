import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase-server";
import { firstSearchParam } from "@/lib/query-params";
import {
  AUTH_CALLBACK_ERROR_MESSAGE,
  AUTH_CALLBACK_ERROR_PARAM,
  AUTH_RESET_ERROR_MESSAGE,
  AUTH_RESET_ERROR_PARAM,
  RESET_MODE_PARAM,
} from "@/lib/auth";
import LoginForm from "@/app/components/login-form";
import styles from "@/app/components/auth-page.module.css";

// Reads cookies() for the already-signed-in redirect check below, so this
// route can't be prerendered under cacheComponents — a low-traffic page, so
// SSRing it on every request (rather than streaming via Suspense) is fine.
// `instant` is nominally a prefetch-validation setting, but Next's own
// prerender-error message names `instant = false` as the fix for exactly
// this case ("allow a blocking route") — confirmed by removing it and
// reproducing the build failure.
export const instant = false;

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const errorParam = firstSearchParam(sp.error);
  const resetLinkFailed = errorParam === AUTH_RESET_ERROR_PARAM;
  const wantsReset =
    resetLinkFailed || firstSearchParam(sp.mode) === RESET_MODE_PARAM;
  // A signed-in visitor goes home, except one who needs the reset form to
  // request a (new) reset link.
  if (user && !wantsReset) redirect("/");

  // Set by /auth/callback (Google redirect, older confirmation links) or
  // /auth/confirm (sign-up confirmation links) when the link didn't carry a
  // usable code/token or the exchange/verification failed. A failed reset
  // link reopens the reset form.
  const initialError = resetLinkFailed
    ? AUTH_RESET_ERROR_MESSAGE
    : errorParam === AUTH_CALLBACK_ERROR_PARAM
      ? AUTH_CALLBACK_ERROR_MESSAGE
      : null;

  return (
    <main className={styles.main}>
      <h1>Sign in</h1>
      <LoginForm
        key={`${errorParam ?? ""}:${wantsReset}`}
        initialError={initialError}
        initialMode={wantsReset ? "reset" : "signin"}
      />
    </main>
  );
}
