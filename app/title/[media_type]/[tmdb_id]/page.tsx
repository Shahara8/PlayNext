import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getCatalogByTitle } from "@/lib/catalog";
import { posterUrl } from "@/lib/tmdb-image";
import { mediaTypeLabel, releaseYear, titleWithYear } from "@/lib/format";
import { getViewerTitleStates } from "@/lib/viewer-titles";
import { NOT_FOUND_METADATA, titleMetadata } from "@/lib/seo";
import {
  parseTitleRef,
  titleKey,
  titlePath,
  type MediaType,
} from "@/lib/title-ref";
import TitleActions from "@/app/components/title-actions";
import Poster from "@/app/components/poster";
import ShareButton from "@/app/components/share-button";
import WhereToWatch from "@/app/components/where-to-watch";
import styles from "./page.module.css";

// Shared by generateMetadata and the page, so one request reads it once.
// Keyed on primitives: cache() compares arguments by identity.
const getTitleRows = cache((media_type: MediaType, tmdb_id: number) =>
  getCatalogByTitle({ media_type, tmdb_id }),
);

type Params = Promise<{ media_type: string; tmdb_id: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { media_type, tmdb_id } = await params;
  const ref = parseTitleRef(media_type, tmdb_id);
  if (ref === null) return NOT_FOUND_METADATA;
  const rows = await getTitleRows(ref.media_type, ref.tmdb_id);
  // No rows: the page calls notFound(), which sets noindex.
  return rows.length > 0 ? titleMetadata(rows) : NOT_FOUND_METADATA;
}

export default async function TitleDetailPage({ params }: { params: Params }) {
  const { media_type, tmdb_id } = await params;
  const ref = parseTitleRef(media_type, tmdb_id);
  if (ref === null) notFound();

  const rows = await getTitleRows(ref.media_type, ref.tmdb_id);
  if (rows.length === 0) notFound();

  const { userId, states, unavailable } = await getViewerTitleStates([ref]);

  const title = rows[0];
  const poster = posterUrl(title.poster_path, "w500");
  const year = releaseYear(title.release_date);
  const typeLabel = mediaTypeLabel(title.media_type);

  // Phone: poster beside the title block, then Where to watch, actions and
  // overview at full width (.info is display: contents there). Desktop: the
  // poster in its own column, everything else in .info beside it.
  return (
    <main className={styles.main}>
      <div className={styles.layout}>
        <div className={styles.posterWrap}>
          <Poster
            src={poster}
            alt={title.title}
            sizes="(max-width: 800px) 120px, 260px"
            className={styles.poster}
            fallbackClassName={styles.posterFallback}
          />
        </div>

        <div className={styles.info}>
          <div className={styles.head}>
            <h1>{title.title}</h1>
            <p className={styles.meta}>
              {[year, typeLabel].filter(Boolean).join(" · ")}
              {title.vote_average != null && (
                <>
                  {" · "}
                  <span className={styles.rating}>
                    <span aria-hidden="true">★ </span>
                    <span className="sr-only">TMDB rating </span>
                    {title.vote_average.toFixed(1)}
                  </span>
                </>
              )}
            </p>
            {title.genres && title.genres.length > 0 && (
              <ul className={styles.genres} aria-label="Genres">
                {title.genres.map((g) => (
                  <li key={g.id} className="chip">
                    {g.name}
                  </li>
                ))}
              </ul>
            )}
            <div>
              <ShareButton path={titlePath(ref)} title={titleWithYear(title)} />
            </div>
          </div>

          <WhereToWatch rows={rows} />

          <TitleActions
            titleRef={ref}
            userId={userId}
            initialState={states.get(titleKey(ref))}
            unavailable={unavailable}
            labeled
          />

          {title.overview && (
            <p className={styles.overview}>{title.overview}</p>
          )}
        </div>
      </div>
    </main>
  );
}
