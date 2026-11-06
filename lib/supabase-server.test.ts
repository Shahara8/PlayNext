import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServerClient } from "@supabase/ssr";
import { RECOVERY_SESSION_MAX_AGE_S } from "./auth";
import { hasRecentEmailLinkSession } from "./supabase-server";

vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: vi.fn() })),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));

const NOW_S = 1_800_000_000;

function withClaims(result: unknown) {
  vi.mocked(createServerClient).mockReturnValue({
    auth: { getClaims: vi.fn().mockResolvedValue(result) },
  } as never);
}

describe("hasRecentEmailLinkSession", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    vi.useFakeTimers();
    vi.setSystemTime(NOW_S * 1000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is true for a fresh email-link session (comparing in seconds)", async () => {
    withClaims({
      data: { claims: { amr: [{ method: "otp", timestamp: NOW_S - 60 }] } },
      error: null,
    });

    expect(await hasRecentEmailLinkSession()).toBe(true);
  });

  it("is false once the window has passed", async () => {
    withClaims({
      data: {
        claims: {
          amr: [
            {
              method: "otp",
              timestamp: NOW_S - RECOVERY_SESSION_MAX_AGE_S - 1,
            },
          ],
        },
      },
      error: null,
    });

    expect(await hasRecentEmailLinkSession()).toBe(false);
  });

  it("is false for a password session", async () => {
    withClaims({
      data: { claims: { amr: [{ method: "password", timestamp: NOW_S }] } },
      error: null,
    });

    expect(await hasRecentEmailLinkSession()).toBe(false);
  });

  it("is false when signed out or the claims can't be verified", async () => {
    withClaims({ data: null, error: { message: "no session" } });

    expect(await hasRecentEmailLinkSession()).toBe(false);
  });
});
