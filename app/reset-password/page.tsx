import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase-server";
import { AUTH_RESET_ERROR_PARAM } from "@/lib/auth";
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
// template could instead route through /auth/confirm, and links sent before
// either change went through /auth/callback; both arrive already signed in.
export default async function ResetPasswordPage() {
  const user = await getCurrentUser();

  return (
    <main className={styles.main}>
      <h1>Set a new password</h1>
      <RecoverySession
        signedIn={user !== null}
        fallback={
          <p>
            This reset link is invalid or has expired.{" "}
            <Link
              href={`/login?error=${AUTH_RESET_ERROR_PARAM}`}
              className={styles.link}
            >
              Request a new one
            </Link>{" "}
            to reset your password.
          </p>
        }
      >
        <ResetPasswordForm email={user?.email ?? null} />
      </RecoverySession>
    </main>
  );
}
