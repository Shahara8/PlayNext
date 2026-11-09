"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { firstIssueMessage, newPasswordSchema, runAuthCall } from "@/lib/auth";
import styles from "./login-form.module.css";

export default function ResetPasswordForm({ email }: { email: string | null }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = newPasswordSchema.safeParse({ password });
    if (!parsed.success) {
      setError(firstIssueMessage(parsed.error));
      return;
    }

    setSubmitting(true);
    const supabase = createBrowserSupabaseClient();
    const { message } = await runAuthCall(() =>
      supabase.auth.updateUser({ password: parsed.data.password }),
    );
    if (message) {
      setSubmitting(false);
      setError(message);
      return;
    }
    // A reset often follows a compromise, so end every other session too.
    // Best effort: the new password is saved either way.
    await runAuthCall(() => supabase.auth.signOut({ scope: "others" }));
    // Left disabled while navigating, so a second click can't resubmit.
    // Already signed in by the reset link; refresh so the header shows it
    // (see login-form.tsx).
    router.push("/");
    router.refresh();
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {email && <p className={styles.info}>For {email}</p>}
      <label className={styles.field}>
        New password
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
      </label>

      {error && <p className={styles.error}>{error}</p>}

      <button
        type="submit"
        className={`btn btn-primary ${styles.submit}`}
        disabled={submitting}
      >
        Save password
      </button>
    </form>
  );
}
