import { describe, expect, it } from "vitest";
import {
  PROVIDERS,
  REGION,
  getProviderByCode,
  serviceColorVars,
  getProviderBySlug,
} from "./providers";

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

  it("finds Partner TV by its hyphenated slug", () => {
    expect(getProviderBySlug("partner-tv")).toEqual(
      expect.objectContaining({ code: "PARTNER_TV", label: "Partner TV" }),
    );
  });

  it("returns undefined for an unknown slug", () => {
    expect(getProviderBySlug("hbo-max")).toBeUndefined();
  });

  it("is case-sensitive (slugs are lowercase by convention)", () => {
    expect(getProviderBySlug("NETFLIX")).toBeUndefined();
  });
});

describe("getProviderByCode", () => {
  it("finds a known provider by its code", () => {
    expect(getProviderByCode("NETFLIX")).toEqual(
      expect.objectContaining({ slug: "netflix", label: "Netflix" }),
    );
  });

  it("uses the feed's PARTNER_TV code (docs/FEED_REQUIREMENTS.md)", () => {
    expect(getProviderByCode("PARTNER_TV")).toEqual(
      expect.objectContaining({ slug: "partner-tv" }),
    );
  });

  it("returns undefined for an unknown code", () => {
    expect(getProviderByCode("HBO_MAX")).toBeUndefined();
  });
});

describe("serviceColorVars", () => {
  it("gives a provider's color and its on-color", () => {
    const netflix = getProviderByCode("NETFLIX")!;
    expect(serviceColorVars(netflix)).toEqual({
      "--service-color": netflix.color,
      "--service-on": netflix.onColor,
    });
  });

  it("falls back to the accent pair for an unknown provider", () => {
    expect(serviceColorVars(undefined)).toEqual({
      "--service-color": "var(--accent)",
      "--service-on": "var(--accent-contrast)",
    });
  });
});
