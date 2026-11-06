import type { Metadata } from "next";
import Link from "next/link";
import {
  getCurrentUser,
  hasRecentEmailLinkSession,
} from "@/lib/supabase-server";
import { RESET_MODE_PARAM } from "@/lib/auth";
import ResetPasswordForm from "@/app/components/reset-password-form";
import RecoverySession from "@/app/components/recovery-session";
import styles from "@/app/components/auth-page.module.css";

// Reads cookies() for the session check, same as /login (see its comment).
export const instant = false;

export const metadata: Metadata = {
  title: "Set a new password",
  robots: { index: false },
};

// Landed on by the reset email's link, which carries the recovery session in
// its #fragment (implicit flow; RecoverySession picks it up). A custom email
// template could instead route through /auth/confirm, which arrives already
// signed in. Either way the form only shows for a session that came from an
// email link recently, never for an ordinary signed-in one.
export default async function ResetPasswordPage() {
  // Independent auth reads, so in parallel.
  const [user, recentEmailLink] = await Promise.all([
    getCurrentUser(),
    hasRecentEmailLinkSession(),
  ]);
  const canReset = user !== null && recentEmailLink;

  return (
    <main className={styles.main}>
      <h1>Set a new password</h1>
      <RecoverySession
        canReset={canReset}
        fallback={
          <p>
            To set a new password, open the link in your reset email (links work
            once, for an hour).{" "}
            <Link
              href={`/login?mode=${RESET_MODE_PARAM}`}
              className={styles.link}
            >
              Request a new one
            </Link>{" "}
            if yours is missing or expired.
          </p>
        }
      >
        <ResetPasswordForm email={user?.email ?? null} />
      </RecoverySession>
    </main>
  );
}
