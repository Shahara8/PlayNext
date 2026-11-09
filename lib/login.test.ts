import { describe, expect, it } from "vitest";
import { AUTH_CALLBACK_ERROR_MESSAGE, AUTH_RESET_ERROR_MESSAGE } from "./auth";
import {
  LOGIN_TABS,
  loginCopy,
  loginDocumentTitle,
  parseLoginParams,
} from "./login";

describe("LOGIN_TABS", () => {
  it("is Sign in then Sign up, with no tab for forgot-password", () => {
    expect(LOGIN_TABS).toEqual([
      { mode: "signin", label: "Sign in" },
      { mode: "signup", label: "Sign up" },
    ]);
  });
});

describe("loginCopy", () => {
  it("titles the page after the tab", () => {
    expect(loginCopy("signin").heading).toBe("Sign in");
    expect(loginCopy("signup").heading).toBe("Create account");
    expect(loginCopy("reset").heading).toBe("Reset password");
  });

  it("labels the submit button per mode", () => {
    expect(loginCopy("signin").submit).toBe("Sign in");
    expect(loginCopy("signup").submit).toBe("Create account");
    expect(loginCopy("reset").submit).toBe("Send reset link");
  });
});

describe("loginDocumentTitle", () => {
  it("is the heading plus the site name, as the title template renders it", () => {
    expect(loginDocumentTitle("signin")).toBe("Sign in · PlayNext");
    expect(loginDocumentTitle("signup")).toBe("Create account · PlayNext");
    expect(loginDocumentTitle("reset")).toBe("Reset password · PlayNext");
  });
});

describe("parseLoginParams", () => {
  it("opens on sign-in with no message by default", () => {
    expect(parseLoginParams({})).toEqual({
      initialMode: "signin",
      initialError: null,
      wantsReset: false,
      formKey: ":false",
    });
  });

  it("opens forgot-password for ?mode=reset, without a message", () => {
    const p = parseLoginParams({ mode: "reset" });
    expect(p.initialMode).toBe("reset");
    expect(p.initialError).toBeNull();
    expect(p.wantsReset).toBe(true);
  });

  it("reopens forgot-password with its message after a failed reset link", () => {
    const p = parseLoginParams({ error: "reset_link" });
    expect(p.initialMode).toBe("reset");
    expect(p.initialError).toBe(AUTH_RESET_ERROR_MESSAGE);
    expect(p.wantsReset).toBe(true);
  });

  it("shows the sign-in message after a failed callback link", () => {
    const p = parseLoginParams({ error: "auth_callback" });
    expect(p.initialMode).toBe("signin");
    expect(p.initialError).toBe(AUTH_CALLBACK_ERROR_MESSAGE);
    expect(p.wantsReset).toBe(false);
  });

  it("ignores unknown modes and errors", () => {
    expect(parseLoginParams({ mode: "signup", error: "nope" })).toMatchObject({
      initialMode: "signin",
      initialError: null,
      wantsReset: false,
    });
  });

  it("uses the first value when a param repeats", () => {
    expect(parseLoginParams({ mode: ["reset", "x"] }).initialMode).toBe(
      "reset",
    );
    expect(
      parseLoginParams({ error: ["auth_callback", "reset_link"] }).initialError,
    ).toBe(AUTH_CALLBACK_ERROR_MESSAGE);
  });

  it("gives each state its own form key, so the form remounts", () => {
    const keys = [
      {},
      { mode: "reset" },
      { error: "reset_link" },
      { error: "auth_callback" },
    ].map((sp) => parseLoginParams(sp).formKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
