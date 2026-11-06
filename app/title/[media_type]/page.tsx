import { notFound, permanentRedirect } from "next/navigation";
import { findLegacyTitle, getCatalogByTitle } from "@/lib/catalog";
import { parseTmdbId, queryString } from "@/lib/query-params";
import { titlePath } from "@/lib/title-ref";

// Old title links were /title/<tmdb_id>, before titles were keyed on media
// type too (supabase/migrations/0007_title_key_media_type.sql). Links already
// shared (WhatsApp previews, bookmarks) land here, with the id in this
// segment (named media_type for the new route's sake), and get a permanent
// redirect to /title/<media_type>/<tmdb_id>, keeping any query string.
//
// Blocking on purpose: this page renders nothing, so there's no shell worth
// prerendering, and resolving before anything streams makes the redirect a
// real HTTP 308 (what crawlers and link previews follow).
export const instant = false;

export default async function LegacyTitleRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ media_type: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const tmdbId = parseTmdbId((await params).media_type);
  if (tmdbId === null) notFound();

  const ref = await findLegacyTitle(tmdbId);
  // A title no longer on any provider is a not-found here, as it was before,
  // rather than a cached permanent redirect to a not-found page.
  if (ref === null || (await getCatalogByTitle(ref)).length === 0) notFound();
  permanentRedirect(titlePath(ref) + queryString(await searchParams));
}
