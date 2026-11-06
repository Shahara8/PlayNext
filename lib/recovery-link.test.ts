import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { consumeRecoveryLink, type RecoveryLinkEnv } from "./recovery-link";

const SESSION_HASH = "#access_token=at&refresh_token=rt&type=recovery";

function env(hash: string, setSessionResult?: Promise<{ error: unknown }>) {
  return {
    location: { hash, pathname: "/reset-password", search: "?x=1" },
    replaceUrl: vi.fn(),
    setSession: vi.fn(
      () => setSessionResult ?? Promise.resolve({ error: null }),
    ),
  } satisfies RecoveryLinkEnv;
}

describe("consumeRecoveryLink", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("stores the link's session, then clears the fragment", async () => {
    const e = env(SESSION_HASH);

    expect(await consumeRecoveryLink(e)).toBe("signed-in");
    expect(e.setSession).toHaveBeenCalledWith({
      access_token: "at",
      refresh_token: "rt",
    });
    expect(e.replaceUrl).toHaveBeenCalledWith("/reset-password?x=1");
  });

  it("leaves a URL without a reset link alone", async () => {
    const e = env("#some-anchor");

    expect(await consumeRecoveryLink(e)).toBe("none");
    expect(e.setSession).not.toHaveBeenCalled();
    expect(e.replaceUrl).not.toHaveBeenCalled();
  });

  it("reports a rejected link as invalid and clears it", async () => {
    const e = env("#error=access_denied&error_code=otp_expired");

    expect(await consumeRecoveryLink(e)).toBe("invalid");
    expect(e.setSession).not.toHaveBeenCalled();
    expect(e.replaceUrl).toHaveBeenCalled();
  });

  it("reports tokens Supabase rejects as invalid and clears them", async () => {
    const e = env(
      SESSION_HASH,
      Promise.resolve({ error: new Error("Invalid Refresh Token") }),
    );

    expect(await consumeRecoveryLink(e)).toBe("invalid");
    expect(e.replaceUrl).toHaveBeenCalled();
  });

  it("keeps the fragment for a retry on a network failure", async () => {
    const networkError = new AuthRetryableFetchError("Failed to fetch", 0);
    for (const result of [
      Promise.resolve({ error: networkError }),
      Promise.reject(new TypeError("Failed to fetch")),
    ]) {
      const e = env(SESSION_HASH, result);

      expect(await consumeRecoveryLink(e)).toBe("retry");
      expect(e.replaceUrl).not.toHaveBeenCalled();
    }
  });
});
