import {
  AUTH_CALLBACK_ERROR_MESSAGE,
  AUTH_CALLBACK_ERROR_PARAM,
  AUTH_RESET_ERROR_MESSAGE,
  AUTH_RESET_ERROR_PARAM,
  RESET_MODE_PARAM,
} from "./auth";
import { firstSearchParam } from "./query-params";
import { SITE_NAME } from "./seo";

/** /login's three forms; "reset" is forgot-password, reached from sign-in. */
export type LoginMode = "signin" | "signup" | "reset";

/** The Sign in · Sign up segmented control, in order. Forgot-password has no
 * tab: its heading names it and "Back to sign in" leaves it. */
export const LOGIN_TABS: readonly { mode: LoginMode; label: string }[] = [
  { mode: "signin", label: "Sign in" },
  { mode: "signup", label: "Sign up" },
];

/** Each mode's page heading (it follows the tab) and submit button. */
export function loginCopy(mode: LoginMode): {
  heading: string;
  submit: string;
} {
  switch (mode) {
    case "signup":
      return { heading: "Create account", submit: "Create account" };
    case "reset":
      return { heading: "Reset password", submit: "Send reset link" };
    default:
      return { heading: "Sign in", submit: "Sign in" };
  }
}

/** The browser tab's title for a mode, as the root layout's title template
 * would render it, for when the mode changes in the browser. */
export function loginDocumentTitle(mode: LoginMode): string {
  return `${loginCopy(mode).heading} · ${SITE_NAME}`;
}

/**
 * What /login opens with, from its query. `?error=` is set by /auth/callback
 * and /auth/confirm when a link fails; a failed reset link reopens the
 * forgot-password form with its message, and `?mode=reset` opens that form
 * without one (from /reset-password without a usable link). `wantsReset` lets
 * a signed-in visitor stay to request a reset link; anyone else signed in
 * goes home. `formKey` remounts the form when any of this changes.
 */
export function parseLoginParams(sp: {
  [key: string]: string | string[] | undefined;
}): {
  initialMode: LoginMode;
  initialError: string | null;
  wantsReset: boolean;
  formKey: string;
} {
  const errorParam = firstSearchParam(sp.error);
  const resetLinkFailed = errorParam === AUTH_RESET_ERROR_PARAM;
  const wantsReset =
    resetLinkFailed || firstSearchParam(sp.mode) === RESET_MODE_PARAM;
  const initialError = resetLinkFailed
    ? AUTH_RESET_ERROR_MESSAGE
    : errorParam === AUTH_CALLBACK_ERROR_PARAM
      ? AUTH_CALLBACK_ERROR_MESSAGE
      : null;
  return {
    initialMode: wantsReset ? "reset" : "signin",
    initialError,
    wantsReset,
    formKey: `${errorParam}:${wantsReset}`,
  };
}
