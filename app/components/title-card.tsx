import Link from "next/link";
import { posterUrl } from "@/lib/tmdb-image";
import { mediaTypeLabel, ratingLabel, releaseYear } from "@/lib/format";
import { titlePath } from "@/lib/title-ref";
import type { TitleSummary, TitleUserState } from "@/lib/user-titles";
import TitleActions from "./title-actions";
import Poster from "./poster";
import styles from "./title-card.module.css";

// A grid card (home, browse, My List): the poster with a ★ rating badge, the
// title and "year · type" link to the title page; below them only ♡ and +.
// Like, dislike and rating live on the title page.
export default function TitleCard({
  row,
  userId,
  state,
  stateUnavailable,
}: {
  row: TitleSummary;
  userId: string | null;
  state?: TitleUserState;
  stateUnavailable?: boolean;
}) {
  const poster = posterUrl(row.poster_path);
  const meta = [releaseYear(row.release_date), mediaTypeLabel(row.media_type)]
    .filter(Boolean)
    .join(" · ");
  const rating = ratingLabel(row.vote_average);

  return (
    <div className={styles.card}>
      <Link href={titlePath(row)} className={styles.link}>
        <div className={styles.posterWrap}>
          <Poster
            src={poster}
            alt={row.title}
            decorative
            sizes="(max-width: 600px) 50vw, (max-width: 899px) 33vw, 240px"
            className={styles.poster}
            fallbackClassName={styles.posterFallback}
          />
        </div>
        <span className={styles.title}>{row.title}</span>
        <span className={styles.meta}>{meta}</span>
        {/* Last in the DOM so the link reads "title, meta, rating", but drawn
            on the poster's corner. */}
        {rating && (
          <span className={styles.badge}>
            <span aria-hidden="true">★</span>
            <span className="sr-only">TMDB rating </span>
            {rating}
          </span>
        )}
      </Link>
      <div className={styles.actions}>
        <TitleActions
          titleRef={{ media_type: row.media_type, tmdb_id: row.tmdb_id }}
          userId={userId}
          initialState={state}
          unavailable={stateUnavailable}
        />
      </div>
    </div>
  );
}

/** A loading placeholder in the card's shape, for the grids' skeletons. */
export function TitleCardSkeleton() {
  return (
    <div className={styles.card} aria-hidden="true">
      <div className={`skeleton ${styles.posterSkeleton}`} />
      <div className={`skeleton ${styles.lineSkeleton}`} />
      <div className={`skeleton ${styles.metaSkeleton}`} />
    </div>
  );
}
