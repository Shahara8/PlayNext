import type { Metadata } from "next";
import Link from "next/link";
import {
  getCurrentUser,
  hasRecentEmailLinkSession,
} from "@/lib/supabase-server";
import { RESET_MODE_PARAM } from "@/lib/auth";
import ResetPasswordForm from "@/app/components/reset-password-form";
import RecoverySession from "@/app/components/recovery-session";
import styles from "@/app/components/center-card.module.css";

// Reads cookies() for the session check, same as /login (see its comment).
export const instant = false;

export const metadata: Metadata = {
  title: "Set a new password",
  robots: { index: false },
};

// Landed on by the reset email's link, which carries the recovery session in
// its #fragment (implicit flow; RecoverySession picks it up). A recovery link
// that went through /auth/confirm instead arrives already signed in. Either
// way the form only shows for a session that came from an email link
// recently, never for an ordinary signed-in one.
export default async function ResetPasswordPage() {
  // Independent auth reads, so in parallel.
  const [user, recentEmailLink] = await Promise.all([
    getCurrentUser(),
    hasRecentEmailLinkSession(),
  ]);
  const canReset = user !== null && recentEmailLink;

  return (
    <main className={styles.main}>
      <div className={`card ${styles.card}`}>
        <h1>Set a new password</h1>
        <RecoverySession
          canReset={canReset}
          fallback={
            <>
              <p className={styles.lead}>
                To set a new password, open the link in your reset email. Each
                link works once, for an hour, so request a new one if yours is
                missing or expired.
              </p>
              <div className={styles.actions}>
                <Link
                  href={`/login?mode=${RESET_MODE_PARAM}`}
                  className="btn btn-primary"
                >
                  Request a new link
                </Link>
                <Link href="/" className="btn btn-secondary">
                  Back to home
                </Link>
              </div>
            </>
          }
        >
          <ResetPasswordForm email={user?.email ?? null} />
        </RecoverySession>
      </div>
    </main>
  );
}
