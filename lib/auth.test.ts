import { describe, expect, it } from "vitest";
import {
  AUTH_CALLBACK_ERROR_PARAM,
  AUTH_RESET_ERROR_PARAM,
  callbackFailureUrl,
  firstIssueMessage,
  friendlyAuthErrorMessage,
  NETWORK_ERROR_MESSAGE,
  newPasswordSchema,
  RESET_PASSWORD_PATH,
  runAuthCall,
  resetRequestSchema,
  safeRedirectUrl,
  signInSchema,
  signUpSchema,
} from "./auth";

describe("signUpSchema", () => {
  it("accepts a valid email + 8-char password", () => {
    const result = signUpSchema.safeParse({
      email: "user@example.com",
      password: "password1",
    });
    expect(result.success).toBe(true);
  });

  it("trims the email before validating", () => {
    const result = signUpSchema.safeParse({
      email: "  user@example.com  ",
      password: "password1",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("user@example.com");
  });

  it("rejects an invalid email", () => {
    const result = signUpSchema.safeParse({
      email: "not-an-email",
      password: "password1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password under 8 characters", () => {
    const result = signUpSchema.safeParse({
      email: "user@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });
});

describe("signInSchema", () => {
  it("accepts any non-empty password (no length minimum)", () => {
    const result = signInSchema.safeParse({
      email: "user@example.com",
      password: "x",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty password", () => {
    const result = signInSchema.safeParse({
      email: "user@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing email", () => {
    const result = signInSchema.safeParse({ email: "", password: "x" });
    expect(result.success).toBe(false);
  });
});

describe("friendlyAuthErrorMessage", () => {
  it("translates invalid login credentials", () => {
    expect(friendlyAuthErrorMessage("Invalid login credentials")).toBe(
      "Incorrect email or password.",
    );
  });

  it("translates a duplicate signup", () => {
    expect(friendlyAuthErrorMessage("User already registered")).toContain(
      "already exists",
    );
  });

  it("translates an unconfirmed email", () => {
    expect(friendlyAuthErrorMessage("Email not confirmed")).toContain(
      "confirm your email",
    );
  });

  it("translates reusing the current password on reset", () => {
    expect(
      friendlyAuthErrorMessage(
        "New password should be different from the old password.",
      ),
    ).toContain("current password");
  });

  it("passes through an unrecognized message unchanged", () => {
    expect(friendlyAuthErrorMessage("Something else broke")).toBe(
      "Something else broke",
    );
  });
});

describe("resetRequestSchema", () => {
  it("accepts and trims a valid email", () => {
    const result = resetRequestSchema.safeParse({ email: " a@example.com " });
    expect(result.success && result.data.email).toBe("a@example.com");
  });

  it("rejects an invalid email", () => {
    expect(resetRequestSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

describe("newPasswordSchema", () => {
  it("accepts an 8-char password", () => {
    expect(newPasswordSchema.safeParse({ password: "password" }).success).toBe(
      true,
    );
  });

  it("rejects a password under 8 characters", () => {
    expect(newPasswordSchema.safeParse({ password: "short" }).success).toBe(
      false,
    );
  });
});

const ORIGIN = "https://playnext.test";

describe("safeRedirectUrl", () => {
  it("resolves a same-origin path", () => {
    expect(safeRedirectUrl(RESET_PASSWORD_PATH, ORIGIN)).toBe(
      `${ORIGIN}${RESET_PASSWORD_PATH}`,
    );
    expect(safeRedirectUrl("/title/1?x=1", ORIGIN)).toBe(
      `${ORIGIN}/title/1?x=1`,
    );
  });

  it("falls back to the home page when absent", () => {
    expect(safeRedirectUrl(null, ORIGIN)).toBe(`${ORIGIN}/`);
    expect(safeRedirectUrl("", ORIGIN)).toBe(`${ORIGIN}/`);
  });

  it("never leaves the site", () => {
    for (const next of [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "/\t/evil.com",
      "javascript:alert(1)",
    ])
      expect(new URL(safeRedirectUrl(next, ORIGIN)).origin).toBe(ORIGIN);
  });
});

describe("callbackFailureUrl", () => {
  it("sends a failed reset link back to the reset form", () => {
    expect(callbackFailureUrl(RESET_PASSWORD_PATH, ORIGIN)).toBe(
      `${ORIGIN}/login?error=${AUTH_RESET_ERROR_PARAM}`,
    );
  });

  it("sends any other failure to the generic sign-in error", () => {
    for (const next of [null, "/", "//evil.com/reset-password"])
      expect(callbackFailureUrl(next, ORIGIN)).toBe(
        `${ORIGIN}/login?error=${AUTH_CALLBACK_ERROR_PARAM}`,
      );
  });
});

describe("firstIssueMessage", () => {
  it("returns the first validation message", () => {
    const result = signUpSchema.safeParse({ email: "", password: "x" });
    expect(!result.success && firstIssueMessage(result.error)).toBe(
      "Email is required",
    );
  });
});

describe("runAuthCall", () => {
  it("passes a successful result through with no message", async () => {
    const result = { data: 1, error: null };
    expect(await runAuthCall(async () => result)).toEqual({
      result,
      message: null,
    });
  });

  it("turns a returned error into its friendly message", async () => {
    const { message } = await runAuthCall(async () => ({
      error: { message: "Invalid login credentials" },
    }));
    expect(message).toBe("Incorrect email or password.");
  });

  it("turns a thrown error into the network message", async () => {
    expect(
      await runAuthCall(async (): Promise<{ error: null }> => {
        throw new TypeError("Failed to fetch");
      }),
    ).toEqual({ result: null, message: NETWORK_ERROR_MESSAGE });
  });
});
