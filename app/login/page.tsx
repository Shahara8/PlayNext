import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase-server";
import { loginCopy, parseLoginParams } from "@/lib/login";
import LoginForm from "@/app/components/login-form";
import styles from "@/app/components/center-card.module.css";

// Reads cookies() for the already-signed-in redirect check below, so this
// route can't be prerendered under cacheComponents — a low-traffic page, so
// SSRing it on every request (rather than streaming via Suspense) is fine.
// `instant` is nominally a prefetch-validation setting, but Next's own
// prerender-error message names `instant = false` as the fix for exactly
// this case ("allow a blocking route") — confirmed by removing it and
// reproducing the build failure.
export const instant = false;

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// Titled after the form it opens on (the form retitles the tab when the
// mode changes; see loginDocumentTitle).
export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { initialMode } = parseLoginParams(await searchParams);
  return { title: loginCopy(initialMode).heading, robots: { index: false } };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  const { initialMode, initialError, wantsReset, formKey } = parseLoginParams(
    await searchParams,
  );
  // A signed-in visitor goes home, except one who needs the reset form to
  // request a (new) reset link.
  if (user && !wantsReset) redirect("/");

  // The card and its heading are LoginForm's, so the heading follows the tab.
  return (
    <main className={styles.main}>
      <LoginForm
        key={formKey}
        initialError={initialError}
        initialMode={initialMode}
      />
    </main>
  );
}
