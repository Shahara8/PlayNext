"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createBrowserSupabaseClient,
  getImplicitFlowClient,
} from "@/lib/supabase-browser";
import {
  firstIssueMessage,
  RESET_PASSWORD_PATH,
  resetRequestSchema,
  runAuthCall,
  signInSchema,
  signUpSchema,
} from "@/lib/auth";
import styles from "./login-form.module.css";

// "reset": the forgot-password form, reached from sign-in.
type Mode = "signin" | "signup" | "reset";

export default function LoginForm({
  initialError = null,
  initialMode = "signin",
}: {
  initialError?: string | null;
  initialMode?: Mode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  async function handleResetRequest() {
    const parsed = resetRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setError(firstIssueMessage(parsed.error));
      return;
    }

    setSubmitting(true);
    const { message } = await runAuthCall(() =>
      // Implicit flow, so the link works in any browser (see
      // getImplicitFlowClient).
      getImplicitFlowClient().auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: `${window.location.origin}${RESET_PASSWORD_PATH}`,
      }),
    );
    setSubmitting(false);
    if (message) {
      setError(message);
      return;
    }
    // Worded the same whether or not the account exists, as Supabase is.
    setInfo(
      "If an account exists for that email, a link to reset your password is on its way.",
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (mode === "reset") return handleResetRequest();

    const schema = mode === "signup" ? signUpSchema : signInSchema;
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      setError(firstIssueMessage(parsed.error));
      return;
    }

    setSubmitting(true);
    const supabase = createBrowserSupabaseClient();

    if (mode === "signup") {
      const { result, message } = await runAuthCall(() =>
        supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        }),
      );
      setSubmitting(false);
      if (message) {
        setError(message);
        return;
      }
      if (result?.data.session) {
        // `refresh()` after `push()` — the header's auth state (AuthNav) is
        // an async Server Component behind a Suspense boundary, and without
        // this, client-router navigation can serve a cached RSC payload for
        // "/" from before sign-in, leaving it stuck on "Sign in".
        router.push("/");
        router.refresh();
      } else {
        setInfo("Check your email to confirm your account before signing in.");
      }
      return;
    }

    const { message } = await runAuthCall(() =>
      supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      }),
    );
    setSubmitting(false);
    if (message) {
      setError(message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function handleGoogleSignIn() {
    setError(null);
    const { message } = await runAuthCall(() =>
      createBrowserSupabaseClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      }),
    );
    if (message) setError(message);
  }

  return (
    <div className={styles.container}>
      <div className={styles.tabs}>
        <button
          type="button"
          className={mode === "signin" ? styles.tabActive : styles.tab}
          onClick={() => switchMode("signin")}
        >
          Sign in
        </button>
        <button
          type="button"
          className={mode === "signup" ? styles.tabActive : styles.tab}
          onClick={() => switchMode("signup")}
        >
          Sign up
        </button>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        {mode === "reset" ? (
          <p className={styles.info}>
            Enter your account&apos;s email and we&apos;ll send you a link to
            set a new password.
          </p>
        ) : (
          <label className={styles.field}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              required
            />
          </label>
        )}

        {error && <p className={styles.error}>{error}</p>}
        {info && <p className={styles.info}>{info}</p>}

        <button type="submit" className={styles.submit} disabled={submitting}>
          {mode === "signup"
            ? "Create account"
            : mode === "reset"
              ? "Send reset link"
              : "Sign in"}
        </button>

        {mode === "signin" && (
          <button
            type="button"
            className={styles.textButton}
            onClick={() => switchMode("reset")}
          >
            Forgot password?
          </button>
        )}
        {mode === "reset" && (
          <button
            type="button"
            className={styles.textButton}
            onClick={() => switchMode("signin")}
          >
            Back to sign in
          </button>
        )}
      </form>

      <div className={styles.divider}>or</div>

      <button
        type="button"
        className={styles.google}
        onClick={handleGoogleSignIn}
      >
        Continue with Google
      </button>
    </div>
  );
}
