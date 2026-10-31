import { describe, expect, it } from "vitest";
import { PROVIDERS, REGION, getProviderBySlug } from "./providers";

describe("PROVIDERS", () => {
  it("has a non-empty label and color for every entry", () => {
    for (const provider of PROVIDERS) {
      expect(provider.label.length).toBeGreaterThan(0);
      expect(provider.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("has unique codes and unique slugs", () => {
    const codes = PROVIDERS.map((p) => p.code);
    const slugs = PROVIDERS.map((p) => p.slug);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("REGION", () => {
  it("is fixed to IL for MVP", () => {
    expect(REGION).toBe("IL");
  });
});

describe("getProviderBySlug", () => {
  it("finds a known provider by its slug", () => {
    expect(getProviderBySlug("netflix")).toEqual(
      expect.objectContaining({ code: "NETFLIX", label: "Netflix" }),
    );
  });

  it("returns undefined for an unknown slug", () => {
    expect(getProviderBySlug("hbo-max")).toBeUndefined();
  });

  it("is case-sensitive (slugs are lowercase by convention)", () => {
    expect(getProviderBySlug("NETFLIX")).toBeUndefined();
  });
});
