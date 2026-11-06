import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase-server";
import { AUTH_RESET_ERROR_PARAM } from "@/lib/auth";
import ResetPasswordForm from "@/app/components/reset-password-form";
import styles from "@/app/components/auth-page.module.css";

// Reads cookies() for the session check, same as /login (see its comment).
export const instant = false;

export const metadata: Metadata = {
  title: "Set a new password",
  robots: { index: false },
};

// Landed on via the reset email: /auth/confirm (or, for links sent before
// the email template change, /auth/callback) with next=/reset-password,
// which has already signed the visitor in with a recovery session.
export default async function ResetPasswordPage() {
  const user = await getCurrentUser();

  return (
    <main className={styles.main}>
      <h1>Set a new password</h1>
      {user ? (
        <ResetPasswordForm email={user.email ?? null} />
      ) : (
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
      )}
    </main>
  );
}
