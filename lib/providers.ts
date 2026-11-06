// Provider metadata for the picker/browse UI. `code` must match
// provider_availability.provider exactly: the codes agreed with the feed in
// docs/FEED_REQUIREMENTS.md section 2.3, also used by data/mock-feed.jsonl
// (scripts/seed-mock-data.test.ts checks the mock rows). Nothing in the
// database enforces it, so a mismatched code just shows no rows. `slug` is the
// URL-friendly form used in /browse/[provider]. Region is fixed to IL for MVP
// (docs/MVP.md Section 5).

export interface Provider {
  code: string;
  slug: string;
  label: string;
  color: string;
}

export const REGION = "IL";

export const PROVIDERS: Provider[] = [
  { code: "NETFLIX", slug: "netflix", label: "Netflix", color: "#e50914" },
  {
    code: "DISNEY_PLUS",
    slug: "disney-plus",
    label: "Disney+",
    color: "#113ccf",
  },
  { code: "PRIME", slug: "prime", label: "Prime Video", color: "#00a8e1" },
  { code: "YES", slug: "yes", label: "yes", color: "#f5a800" },
  {
    code: "PARTNER_TV",
    slug: "partner-tv",
    label: "Partner TV",
    // Green, so its dot stays distinct from Prime Video's cyan.
    color: "#2bb673",
  },
];

export function getProviderBySlug(slug: string): Provider | undefined {
  return PROVIDERS.find((p) => p.slug === slug);
}

export function getProviderByCode(code: string): Provider | undefined {
  return PROVIDERS.find((p) => p.code === code);
}
