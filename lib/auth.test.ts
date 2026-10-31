import { describe, expect, it } from "vitest";
import { friendlyAuthErrorMessage, signInSchema, signUpSchema } from "./auth";

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

  it("passes through an unrecognized message unchanged", () => {
    expect(friendlyAuthErrorMessage("Something else broke")).toBe(
      "Something else broke",
    );
  });
});
