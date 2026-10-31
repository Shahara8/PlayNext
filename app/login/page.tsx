import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase-server";
import { firstSearchParam } from "@/lib/query-params";
import {
  AUTH_CALLBACK_ERROR_MESSAGE,
  AUTH_CALLBACK_ERROR_PARAM,
} from "@/lib/auth";
import LoginForm from "@/app/components/login-form";
import styles from "./page.module.css";

// Reads cookies() for the already-signed-in redirect check below, so this
// route can't be prerendered under cacheComponents — a low-traffic page, so
// SSRing it on every request (rather than streaming via Suspense) is fine.
// `instant` is nominally a prefetch-validation setting, but Next's own
// prerender-error message names `instant = false` as the fix for exactly
// this case ("allow a blocking route") — confirmed by removing it and
// reproducing the build failure.
export const instant = false;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const sp = await searchParams;
  // Set by /auth/callback when the Google redirect or email-confirmation
  // link didn't carry a usable code, or exchanging it failed.
  const hadCallbackError =
    firstSearchParam(sp.error) === AUTH_CALLBACK_ERROR_PARAM;

  return (
    <main className={styles.main}>
      <h1>Sign in</h1>
      <LoginForm
        initialError={hadCallbackError ? AUTH_CALLBACK_ERROR_MESSAGE : null}
      />
    </main>
  );
}
