import { z } from "zod";

// Value of /login's `?error=` param set by app/auth/callback/route.ts when
// the OAuth/email-confirmation code exchange fails or is missing — shared so
// the route and the page that reads it can't drift apart.
export const AUTH_CALLBACK_ERROR_PARAM = "auth_callback";
export const AUTH_CALLBACK_ERROR_MESSAGE =
  "Something went wrong signing you in — please try again.";
// When a Supabase call throws instead of returning an error (offline, etc.).
export const NETWORK_ERROR_MESSAGE =
  "Couldn't reach the server — please try again.";
// The same, for a password-reset link: /login opens on the reset form.
export const AUTH_RESET_ERROR_PARAM = "reset_link";
export const AUTH_RESET_ERROR_MESSAGE =
  "That reset link is invalid or has expired (each link works once, in the browser that requested it). Request a new one below.";

// Where /auth/callback sends a password-reset link, so the recovery session
// it signs in with lands on the set-a-new-password form.
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
 * Where /auth/callback sends a successful sign-in: its `?next=` resolved
 * against the site's origin, or the home page when absent or pointing
 * off-site ("//evil.com" resolves to another host), so the callback can't be
 * used as an open redirect.
 */
export function safeRedirectUrl(next: string | null, origin: string): string {
  const url = new URL(next || "/", origin);
  return url.origin === origin ? url.toString() : `${origin}/`;
}

/** Where /auth/callback sends a failed code exchange, by what it was for. */
export function callbackFailureUrl(
  next: string | null,
  origin: string,
): string {
  const isReset =
    new URL(safeRedirectUrl(next, origin)).pathname === RESET_PASSWORD_PATH;
  const param = isReset ? AUTH_RESET_ERROR_PARAM : AUTH_CALLBACK_ERROR_PARAM;
  return `${origin}/login?error=${param}`;
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
