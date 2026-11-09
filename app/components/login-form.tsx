"use client";

import { useEffect, useState } from "react";
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
import {
  LOGIN_TABS,
  loginCopy,
  loginDocumentTitle,
  type LoginMode as Mode,
} from "@/lib/login";
import FormMessage from "./form-message";
import card from "./center-card.module.css";
import styles from "./login-form.module.css";

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
            // Token-hash link, works in any browser (see /auth/confirm).
            emailRedirectTo: `${window.location.origin}/auth/confirm`,
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
    setInfo(null);
    const { message } = await runAuthCall(() =>
      createBrowserSupabaseClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      }),
    );
    if (message) setError(message);
  }

  const copy = loginCopy(mode);
  // The tab's title follows the heading too (the server sets the first one,
  // see app/login/page.tsx).
  useEffect(() => {
    document.title = loginDocumentTitle(mode);
  }, [mode]);

  // The whole card, heading included, so the heading follows the tab.
  return (
    <div className={`card ${card.card}`}>
      <h1>{copy.heading}</h1>
      {mode !== "reset" && (
        <div
          className={`segmented ${styles.tabs}`}
          role="group"
          aria-label="Sign in or sign up"
        >
          {LOGIN_TABS.map((tab) => (
            <button
              key={tab.mode}
              type="button"
              aria-pressed={mode === tab.mode}
              onClick={() => switchMode(tab.mode)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <form className={styles.form} onSubmit={handleSubmit}>
        {mode === "reset" && (
          <p className={card.lead}>
            Enter your account&apos;s email and we&apos;ll send you a link to
            set a new password.
          </p>
        )}
        <label className={styles.field}>
          Email
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        {mode !== "reset" && (
          <label className={styles.field}>
            Password
            <input
              className="input"
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

        {error && <FormMessage kind="error">{error}</FormMessage>}
        {info && <FormMessage kind="info">{info}</FormMessage>}

        <button
          type="submit"
          className={`btn btn-primary ${styles.fullWidth}`}
          disabled={submitting}
        >
          {copy.submit}
        </button>

        {mode === "signin" && (
          <button
            type="button"
            className={`text-link ${styles.textButton}`}
            onClick={() => switchMode("reset")}
          >
            Forgot password?
          </button>
        )}
        {mode === "reset" && (
          <button
            type="button"
            className={`text-link ${styles.textButton}`}
            onClick={() => switchMode("signin")}
          >
            Back to sign in
          </button>
        )}
      </form>

      <div className={styles.divider}>or</div>
      <button
        type="button"
        className={`btn btn-secondary ${styles.fullWidth}`}
        onClick={handleGoogleSignIn}
      >
        Continue with Google
      </button>
    </div>
  );
}
