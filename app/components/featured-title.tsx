import Link from "next/link";
import { connection } from "next/server";
import { cache } from "react";
import { getFeaturedTitle } from "@/lib/catalog";
import { mediaTypeLabel, ratingLabel, releaseYear } from "@/lib/format";
import { posterUrl } from "@/lib/tmdb-image";
import { titlePath } from "@/lib/title-ref";
import Poster from "./poster";
import WhereToWatch from "./where-to-watch";
import styles from "./featured-title.module.css";

/**
 * The home page's featured title, read once per request: this section shows
 * it and the grid below (ForYou) leaves it out.
 */
export const getHomeFeatured = cache(getFeaturedTitle);

const HEADING = "Trending now";

// "Trending now" (TMDB's worldwide popularity, so not "in Israel"): the top
// title as a wide card with its Where to watch rows.
export default async function FeaturedTitle() {
  // Outside the try, as in ForYou: during prerendering connection() rejects
  // on purpose to mark this section dynamic.
  await connection();
  let rows: Awaited<ReturnType<typeof getFeaturedTitle>>;
  try {
    rows = await getHomeFeatured();
  } catch (error) {
    console.error(error);
    return null;
  }
  if (!rows) return null;

  const title = rows[0];
  const href = titlePath(title);
  const rating = ratingLabel(title.vote_average);
  const meta = [
    releaseYear(title.release_date),
    mediaTypeLabel(title.media_type),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className={styles.section} aria-labelledby="featured-heading">
      <h2 id="featured-heading">{HEADING}</h2>
      <div className={`card ${styles.card}`}>
        {/* The title link below names it; this one is a mouse shortcut. */}
        <Link
          href={href}
          className={styles.posterWrap}
          tabIndex={-1}
          aria-hidden="true"
        >
          <Poster
            src={posterUrl(title.poster_path)}
            alt={title.title}
            decorative
            sizes="(max-width: 700px) 104px, 180px"
            className={styles.poster}
            fallbackClassName={styles.posterFallback}
          />
        </Link>
        <div className={styles.head}>
          <h3 className={styles.title}>
            <Link href={href} className={styles.titleLink}>
              {title.title}
            </Link>
          </h3>
          <p className={styles.meta}>
            {meta}
            {rating && (
              <>
                {meta && " · "}
                <span className={styles.rating}>
                  <span aria-hidden="true">★ </span>
                  <span className="sr-only">TMDB rating </span>
                  {rating}
                </span>
              </>
            )}
          </p>
          {title.overview && (
            <p className={styles.overview}>{title.overview}</p>
          )}
        </div>
        <div className={styles.watch}>
          <WhereToWatch rows={rows} plain />
        </div>
      </div>
    </section>
  );
}

/** The loading placeholder: the card's shape, under the real heading. */
export function FeaturedTitleSkeleton() {
  return (
    <section className={styles.section} aria-hidden="true">
      <h2>{HEADING}</h2>
      <div className={`card ${styles.card}`}>
        <div className={`skeleton ${styles.posterWrap}`} />
        <div className={styles.head}>
          <div className={`skeleton ${styles.lineSkeleton}`} />
          <div className={`skeleton ${styles.metaSkeleton}`} />
        </div>
        <div className={`skeleton ${styles.watch} ${styles.watchSkeleton}`} />
      </div>
    </section>
  );
}
