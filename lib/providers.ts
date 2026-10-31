// Provider metadata for the picker/browse UI. `code` matches
// provider_availability.provider exactly (see data/mock-feed.jsonl); `slug` is the
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
];

export function getProviderBySlug(slug: string): Provider | undefined {
  return PROVIDERS.find((p) => p.slug === slug);
}
