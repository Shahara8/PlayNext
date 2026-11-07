// A safeguard against wrong IMDb ids in the feed: a well-formed but wrong id
// passes every validation rule and shows users another title's poster,
// synopsis and rating (found 2026-11-07: the mock "Shtisel" carried Phantom
// Thread's id). The resolver accepts a movie for a "series" row on purpose
// (feeds mislabel types), so the loud signal is a type mismatch *plus* titles
// that don't match either. Such rows are flagged in the run's report and
// error_summary, never blocked.

import type { FeedMediaType } from "../../../lib/tmdb-resolve";
import type { TitleNames } from "../tmdb/store";
import {
  titleKey,
  type MediaType,
  type TitleRef,
} from "../../../lib/title-ref";

export interface MatchWarning {
  imdb_id: string;
  feed_type: FeedMediaType;
  feed_title: string;
  feed_original_title: string | null;
  tmdb: TitleRef & { title: string; original_title: string | null };
}

const MEDIA_TYPE_OF: Record<FeedMediaType, MediaType> = {
  movie: "movie",
  tv_series: "tv",
};

interface CheckedRow {
  imdb_id: string;
  type: FeedMediaType;
  title: string;
  original_title?: string | null;
}

/**
 * For comparing titles across sources: case, accents, punctuation and
 * spacing ignored ("The Bear!" = "the bear"), and "&" read as "and". Letters
 * of any script are kept.
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** Rows keyed to a TMDB title of another type than the feed says. */
export function typeMismatches<R extends CheckedRow>(
  rows: readonly R[],
  keys: ReadonlyMap<string, TitleRef | null>,
): { row: R; key: TitleRef }[] {
  return rows.flatMap((row) => {
    const key = keys.get(row.imdb_id);
    return key && key.media_type !== MEDIA_TYPE_OF[row.type]
      ? [{ row, key }]
      : [];
  });
}

/**
 * Of the type-mismatched rows (typeMismatches), the ones whose titles also
 * match none of TMDB's (title or original title, either way round): the
 * warnings. A row whose TMDB names weren't found can't be judged: counted
 * as unchecked.
 */
export function matchWarnings(
  mismatches: readonly { row: CheckedRow; key: TitleRef }[],
  names: ReadonlyMap<string, TitleNames>,
): { warnings: MatchWarning[]; unchecked: number } {
  const warnings: MatchWarning[] = [];
  let unchecked = 0;
  const same = (a?: string | null, b?: string | null) =>
    !!a &&
    !!b &&
    normalizeTitle(a) !== "" &&
    normalizeTitle(a) === normalizeTitle(b);
  for (const { row, key } of mismatches) {
    const tmdb = names.get(titleKey(key));
    if (!tmdb) {
      unchecked++;
      continue;
    }
    const ours = [row.title, row.original_title];
    const theirs = [tmdb.title, tmdb.original_title];
    if (ours.some((a) => theirs.some((b) => same(a, b)))) continue;
    warnings.push({
      imdb_id: row.imdb_id,
      feed_type: row.type,
      feed_title: row.title,
      feed_original_title: row.original_title ?? null,
      tmdb: { ...key, title: tmdb.title, original_title: tmdb.original_title },
    });
  }
  return { warnings, unchecked };
}
