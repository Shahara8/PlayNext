"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { firstIssue, newPasswordSchema, runAuthCall } from "@/lib/auth";
import FormField from "./form-field";
import FormMessage from "./form-message";
import card from "./center-card.module.css";
import styles from "./login-form.module.css";

export default function ResetPasswordForm({ email }: { email: string | null }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  // The save failing (above the button), or the password itself (under it).
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPasswordError(null);

    const parsed = newPasswordSchema.safeParse({ password });
    if (!parsed.success) {
      // Under the field when it's about the password, else above the button.
      const issue = firstIssue(parsed.error);
      if (issue.field === "password") setPasswordError(issue.message);
      else setError(issue.message);
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
      {email && <p className={card.lead}>For {email}</p>}
      <FormField
        label="New password"
        type="password"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setPasswordError(null);
        }}
        autoComplete="new-password"
        required
        error={passwordError}
      />

      {error && <FormMessage kind="error">{error}</FormMessage>}

      <button
        type="submit"
        className={`btn btn-primary ${styles.fullWidth}`}
        disabled={submitting}
      >
        Save password
      </button>
    </form>
  );
}
