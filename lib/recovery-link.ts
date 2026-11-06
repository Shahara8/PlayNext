import { parseRecoveryHash } from "./auth";

// What an implicit-flow reset link (see createImplicitFlowClient) needs from
// the browser, injected so tests can fake it.
export interface RecoveryLinkEnv {
  location: { hash: string; pathname: string; search: string };
  replaceUrl: (url: string) => void;
  setSession: (tokens: {
    access_token: string;
    refresh_token: string;
  }) => Promise<{ error: unknown }>;
}

/**
 * "signed-in": the link's session is now in the cookie-backed client.
 * "none": the URL had no reset link to consume. "invalid": Supabase rejected
 * the link (expired/used) or its tokens. "retry": storing the session failed
 * on the network (e.g. offline); the fragment is kept so a reload tries again.
 */
export type RecoveryLinkOutcome = "signed-in" | "none" | "invalid" | "retry";

/** Takes a reset link's session out of the URL fragment and stores it. */
export async function consumeRecoveryLink(
  env: RecoveryLinkEnv,
): Promise<RecoveryLinkOutcome> {
  const hash = parseRecoveryHash(env.location.hash);
  if (hash.kind === "none") return "none";

  // Tokens (or the error) out of the address bar and history, keeping any
  // query string.
  const clearFragment = () =>
    env.replaceUrl(env.location.pathname + env.location.search);

  if (hash.kind === "error") {
    console.error("reset link rejected:", hash.description);
    clearFragment();
    return "invalid";
  }

  let error: unknown;
  let retryable: boolean;
  try {
    ({ error } = await env.setSession({
      access_token: hash.accessToken,
      refresh_token: hash.refreshToken,
    }));
    // supabase-js returns network failures as AuthRetryableFetchError; any
    // other error means the tokens themselves are bad, and retrying them
    // would only fail again.
    retryable =
      error instanceof Error && error.name === "AuthRetryableFetchError";
  } catch (thrown) {
    error = thrown;
    retryable = true;
  }
  if (!error) {
    clearFragment();
    return "signed-in";
  }
  console.error("reset link: setSession failed", error);
  if (retryable) return "retry";
  clearFragment();
  return "invalid";
}
