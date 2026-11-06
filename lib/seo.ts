import type { Metadata } from "next";
import type { CatalogRow } from "./catalog";
import { titleWithYear } from "./format";
import { getProviderByCode } from "./providers";
import { titlePath } from "./title-ref";
import { posterUrl } from "./tmdb-image";

export const SITE_NAME = "PlayNext";
export const SITE_DESCRIPTION =
  "Find where to watch any movie or show across streaming services.";

// Contact for privacy and account questions: the Google OAuth consent
// screen's support address, so users see the same one everywhere.
export const SUPPORT_EMAIL = "play.next.app8@gmail.com";

// Linked from the footer and from the Google OAuth consent screen's
// Branding page ("Application privacy policy link"), so keep the path stable.
export const PRIVACY_PATH = "/privacy";

export const PRIVACY_METADATA: Metadata = {
  title: "Privacy policy",
  description: `What ${SITE_NAME} stores about you, why, and how to have it deleted.`,
  alternates: { canonical: PRIVACY_PATH },
};

// For pages that call notFound(): the page's own metadata wins over
// app/not-found.tsx's, so they return this themselves.
export const NOT_FOUND_METADATA: Metadata = { title: "Not found" };

// Longest search query shown in a page title.
export const MAX_SEARCH_TITLE_QUERY = 60;

// Search engines cut descriptions off around here.
export const MAX_DESCRIPTION_LENGTH = 160;

const LOCAL_SITE_URL = "http://localhost:3000";

// An origin from an env var, with https:// added when the scheme is missing;
// null if it still doesn't parse.
function parseOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    ).origin;
  } catch {
    return null;
  }
}

/**
 * The site's public origin, for `metadataBase` (canonical and og:url). Without
 * one Next resolves relative URLs against localhost. NEXT_PUBLIC_SITE_URL wins
 * (e.g. a custom domain); otherwise Vercel's production domain, which Vercel
 * sets on every deployment. Always a valid URL: the root layout builds a
 * `URL` from it, and a throw there would take down every page.
 */
export function siteUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  return (
    parseOrigin(env.NEXT_PUBLIC_SITE_URL) ??
    parseOrigin(env.VERCEL_PROJECT_PRODUCTION_URL) ??
    LOCAL_SITE_URL
  );
}

/**
 * Cuts at a word boundary and adds an ellipsis when over `max` code points
 * (so an emoji or other astral character is never split in half).
 */
export function truncateDescription(
  text: string,
  max = MAX_DESCRIPTION_LENGTH,
): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const chars = Array.from(clean);
  if (chars.length <= max) return clean;
  const cut = chars.slice(0, max - 1).join("");
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:]+$/, "")}…`;
}

/**
 * Metadata for /search. Result pages are kept out of search engines; the
 * empty page is fine. The query is cut by code point, so an emoji is never
 * split in half, and otherwise left exactly as typed.
 */
export function searchMetadata(q: string): Metadata {
  if (!q) return { title: "Search", alternates: { canonical: "/search" } };
  const chars = Array.from(q);
  const shown =
    chars.length > MAX_SEARCH_TITLE_QUERY
      ? `${chars.slice(0, MAX_SEARCH_TITLE_QUERY - 1).join("")}…`
      : q;
  return { title: `“${shown}” – Search`, robots: { index: false } };
}

/**
 * Metadata for a provider's browse page. Sort/filter variants share the base
 * URL as canonical, so they aren't indexed as separate pages.
 */
export function browseMetadata(provider: {
  slug: string;
  label: string;
}): Metadata {
  const title = `Watch on ${provider.label}`;
  const description = `Browse the movies and shows streaming on ${provider.label} in Israel, sorted by what's trending, newest or top rated.`;
  const path = `/browse/${provider.slug}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      type: "website",
    },
  };
}

/**
 * Metadata for a title detail page, from its live provider rows (all share
 * the title's metadata). The description leads with where to watch it, the
 * page's whole point, then the overview.
 */
export function titleMetadata(rows: CatalogRow[]): Metadata {
  const title = rows[0];
  const name = titleWithYear(title);
  const providers = Array.from(
    new Set(
      rows.map((row) => getProviderByCode(row.provider)?.label ?? row.provider),
    ),
  );
  const description = truncateDescription(
    [`Where to watch ${name}: ${providers.join(", ")}.`, title.overview]
      .filter(Boolean)
      .join(" "),
  );
  const poster = posterUrl(title.poster_path, "w500");
  const path = titlePath(title);

  return {
    title: name,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: name,
      description,
      url: path,
      siteName: SITE_NAME,
      type: title.media_type === "tv" ? "video.tv_show" : "video.movie",
      ...(poster && {
        // No width/height: TMDB posters aren't always exactly 2:3.
        images: [{ url: poster, alt: title.title }],
      }),
    },
    twitter: { card: "summary", title: name, description },
  };
}
