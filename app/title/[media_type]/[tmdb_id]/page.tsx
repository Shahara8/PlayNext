import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getCatalogByTitle } from "@/lib/catalog";
import { posterUrl } from "@/lib/tmdb-image";
import { getProviderByCode } from "@/lib/providers";
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

  return (
    <main className={styles.main}>
      <div className={styles.layout}>
        <div className={styles.posterWrap}>
          <Poster
            src={poster}
            alt={title.title}
            sizes="(max-width: 600px) 160px, 260px"
            className={styles.poster}
            fallbackClassName={styles.posterFallback}
          />
        </div>

        <div className={styles.info}>
          <h1>{title.title}</h1>
          <div className={styles.meta}>
            {year && <span>{year}</span>}
            <span>{typeLabel}</span>
            {title.vote_average != null && (
              <span>★ {title.vote_average.toFixed(1)}</span>
            )}
          </div>

          <div className={styles.actionsRow}>
            <TitleActions
              titleRef={ref}
              userId={userId}
              initialState={states.get(titleKey(ref))}
              unavailable={unavailable}
            />
            <ShareButton path={titlePath(ref)} title={titleWithYear(title)} />
          </div>

          {title.genres && title.genres.length > 0 && (
            <div className={styles.genres}>
              {title.genres.map((g) => (
                <span key={g.id} className={styles.genre}>
                  {g.name}
                </span>
              ))}
            </div>
          )}

          {title.overview && (
            <p className={styles.overview}>{title.overview}</p>
          )}

          <section className={styles.providers}>
            <h2>Where to watch</h2>
            <ul className={styles.providerList}>
              {rows.map((row) => {
                const providerMeta = getProviderByCode(row.provider);
                return (
                  <li key={row.availability_id} className={styles.providerItem}>
                    <span
                      className={styles.providerDot}
                      style={{
                        background:
                          providerMeta?.color ?? "var(--foreground-muted)",
                      }}
                    />
                    <span className={styles.providerName}>
                      {providerMeta?.label ?? row.provider}
                    </span>
                    <span className={styles.availabilityType}>
                      {row.availability_type}
                    </span>
                    {row.watch_url && (
                      <a
                        href={row.watch_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.watchLink}
                      >
                        Watch →
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
