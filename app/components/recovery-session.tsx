"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import {
  consumeRecoveryLink,
  type RecoveryLinkOutcome,
} from "@/lib/recovery-link";
import { NETWORK_ERROR_MESSAGE } from "@/lib/auth";

// Wraps /reset-password's content. A reset link (implicit flow, see
// createImplicitFlowClient) carries the recovery session in the URL's
// #fragment, which never reaches the server: consumeRecoveryLink stores it in
// the cookie-backed client, then the page re-renders server-side, finds the
// session and passes `signedIn`. The link's session always wins, so someone
// already signed in as another account resets the right one.
// Otherwise: `children` (the form) when signed in, else `fallback`.
export default function RecoverySession({
  signedIn,
  children,
  fallback,
}: {
  signedIn: boolean;
  children: React.ReactNode;
  fallback: React.ReactNode;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<RecoveryLinkOutcome | null>(null);
  // Pending until the server re-render with the link's session has landed,
  // so a previously signed-in account's form never flashes up meanwhile.
  const [refreshing, startRefresh] = useTransition();
  // Strict Mode re-runs the effect after the fragment is already cleared.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    consumeRecoveryLink({
      location: window.location,
      replaceUrl: (url) => window.history.replaceState(null, "", url),
      setSession: (tokens) =>
        createBrowserSupabaseClient().auth.setSession(tokens),
    }).then((result) => {
      setOutcome(result);
      if (result === "signed-in") startRefresh(() => router.refresh());
    });
  }, [router]);

  const settled = outcome === "signed-in" && !refreshing;
  useEffect(() => {
    // The session was stored, but the server still didn't see it.
    if (settled && !signedIn)
      console.error("reset link: session not visible after refresh");
  }, [settled, signedIn]);

  if (outcome === null || refreshing) return <p>Checking your reset link…</p>;
  if (outcome === "retry")
    return <p>{NETWORK_ERROR_MESSAGE} Reload this page to retry the link.</p>;
  return outcome !== "invalid" && signedIn ? children : fallback;
}
