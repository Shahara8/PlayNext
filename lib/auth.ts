import type { EmailOtpType as SupabaseEmailOtpType } from "@supabase/supabase-js";
import { z } from "zod";

// Value of /login's `?error=` param set by /auth/callback and /auth/confirm
// when the OAuth/email link's code or token is missing or fails — shared so
// the routes and the page that reads it can't drift apart.
export const AUTH_CALLBACK_ERROR_PARAM = "auth_callback";
export const AUTH_CALLBACK_ERROR_MESSAGE =
  "Something went wrong signing you in — please try again.";
// When a Supabase call throws instead of returning an error (offline, etc.).
export const NETWORK_ERROR_MESSAGE =
  "Couldn't reach the server — please try again.";
// The same, for a password-reset link: /login opens on the reset form.
// (`?mode=reset` opens it with no error, e.g. from /reset-password without a
// usable link.)
export const AUTH_RESET_ERROR_PARAM = "reset_link";
export const RESET_MODE_PARAM = "reset";
export const AUTH_RESET_ERROR_MESSAGE =
  "That reset link is invalid or has expired (each link works only once). Request a new one below.";

// Where a password-reset link ends up, so the recovery session it signs in
// with lands on the set-a-new-password form. Live reset emails come here
// directly (implicit flow, see getImplicitFlowClient). The Reset Password
// template deliberately stays at its default; /auth/confirm only sends a
// stray recovery link here as a safety net.
export const RESET_PASSWORD_PATH = "/reset-password";

const emailField = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Enter a valid email address");
const newPasswordField = z
  .string()
  .min(8, "Password must be at least 8 characters");

export const signUpSchema = z.object({
  email: emailField,
  password: newPasswordField,
});

export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required"),
});

export const resetRequestSchema = z.object({ email: emailField });

export const newPasswordSchema = z.object({ password: newPasswordField });

/**
 * Where /auth/callback and /auth/confirm send a successful sign-in: `next`
 * against the site's origin, or the home page when absent or pointing
 * off-site ("//evil.com" resolves to another host), so the callback can't be
 * used as an open redirect.
 */
export function safeRedirectUrl(next: string | null, origin: string): string {
  const url = new URL(next || "/", origin);
  return url.origin === origin ? url.toString() : `${origin}/`;
}

/** Where those routes send a failed sign-in, by what it was for. */
export function callbackFailureUrl(
  next: string | null,
  origin: string,
): string {
  const isReset =
    new URL(safeRedirectUrl(next, origin)).pathname === RESET_PASSWORD_PATH;
  const param = isReset ? AUTH_RESET_ERROR_PARAM : AUTH_CALLBACK_ERROR_PARAM;
  return `${origin}/login?error=${param}`;
}

// The `type`s Supabase's email templates can put on an /auth/confirm link
// (the SDK's own type also admits any string, so it can't validate input).
const EMAIL_OTP_TYPES = [
  "recovery",
  "signup",
  "email",
  "email_change",
  "invite",
  "magiclink",
] as const satisfies readonly SupabaseEmailOtpType[];
export type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number];

/** An /auth/confirm `?type=`, or null if it isn't one Supabase sends. */
export function parseEmailOtpType(value: string | null): EmailOtpType | null {
  return EMAIL_OTP_TYPES.find((type) => type === value) ?? null;
}

export const MAX_DISPLAY_NAME_LENGTH = 40;

/**
 * How the header names a signed-in user: the identity provider's name
 * (Google sets `full_name`/`name`), else the part of the email before the @.
 * `short` is the first word, for narrow screens.
 */
export function userDisplayName(user: {
  email?: string;
  user_metadata?: Record<string, unknown>;
}): { full: string; short: string } | null {
  const fromProvider = [
    user.user_metadata?.full_name,
    user.user_metadata?.name,
  ].find((v): v is string => typeof v === "string" && v.trim() !== "");
  // Metadata is user-editable, so it's capped rather than trusted to be short.
  const full = (fromProvider?.trim() ?? user.email?.split("@")[0])?.slice(
    0,
    MAX_DISPLAY_NAME_LENGTH,
  );
  if (!full) return null;
  return { full, short: full.split(/\s+/)[0] };
}

// How long after opening a reset link the new-password form stays open.
export const RECOVERY_SESSION_MAX_AGE_S = 60 * 60;

/**
 * Whether a session's JWT `amr` (authentication methods) shows it came from
 * an email link within RECOVERY_SESSION_MAX_AGE_S. Supabase records any
 * verified email link (reset, but also a sign-up confirmation; this app sends
 * no magic links) as method "otp" — checked live against the project — and a
 * normal sign-in as "password"/"oauth". Every one of those proves control of
 * the inbox, the same thing a reset proves, so they all qualify.
 *
 * This only decides whether /reset-password shows its form. It is a UI guard,
 * not enforcement: the session cookies are readable by page scripts, so a
 * borrowed session could call Supabase's updateUser directly. The real
 * backstop is Supabase's "Secure password change" setting (on), which demands
 * reauthentication for password changes from sessions that aren't recent.
 */
export function isRecentEmailLinkSession(
  amr: unknown,
  nowSeconds: number,
): boolean {
  if (!Array.isArray(amr)) return false;
  return amr.some(
    (entry) =>
      entry?.method === "otp" &&
      typeof entry.timestamp === "number" &&
      nowSeconds - entry.timestamp <= RECOVERY_SESSION_MAX_AGE_S,
  );
}

export type RecoveryHash =
  | { kind: "session"; accessToken: string; refreshToken: string }
  | { kind: "error"; description: string | null }
  | { kind: "none" };

/**
 * Reads the #fragment an implicit-flow reset link lands with: the recovery
 * session's tokens, or Supabase's error (e.g. `error_code=otp_expired` for
 * an expired or already-used link), or nothing.
 */
export function parseRecoveryHash(hash: string): RecoveryHash {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (params.get("error") || params.get("error_code"))
    return { kind: "error", description: params.get("error_description") };
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken && params.get("type") === "recovery")
    return { kind: "session", accessToken, refreshToken };
  return { kind: "none" };
}

/** A failed form validation's first message, for the form's error line. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}

/**
 * Runs a Supabase auth call for a form: its result, plus the message to show
 * (null on success). A call that throws instead of returning an error
 * (offline, a dropped connection) gets NETWORK_ERROR_MESSAGE, so the form
 * never stays stuck on "submitting".
 */
export async function runAuthCall<
  T extends { error: { message: string } | null },
>(
  call: () => Promise<T>,
): Promise<{ result: T | null; message: string | null }> {
  try {
    const result = await call();
    return {
      result,
      message: result.error && friendlyAuthErrorMessage(result.error.message),
    };
  } catch {
    return { result: null, message: NETWORK_ERROR_MESSAGE };
  }
}

// Supabase returns plain-English `AuthError.message` strings with no stable
// error code for several common cases — matched here so the UI can show a
// clearer message than the raw string (and translate a couple that would
// otherwise be confusing out of context, like "Email not confirmed").
export function friendlyAuthErrorMessage(message: string): string {
  if (message.includes("Invalid login credentials")) {
    return "Incorrect email or password.";
  }
  if (message.includes("User already registered")) {
    return "An account with this email already exists — try signing in instead.";
  }
  if (message.includes("Email not confirmed")) {
    return "Please confirm your email before signing in — check your inbox for the confirmation link.";
  }
  if (message.includes("should be different from the old password")) {
    return "That's your current password — choose a different one.";
  }
  return message;
}
