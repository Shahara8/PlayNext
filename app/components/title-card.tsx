import Link from "next/link";
import { posterUrl } from "@/lib/tmdb-image";
import { mediaTypeLabel, releaseYear } from "@/lib/format";
import { titlePath } from "@/lib/title-ref";
import type { TitleSummary, TitleUserState } from "@/lib/user-titles";
import TitleActions from "./title-actions";
import Poster from "./poster";
import styles from "./title-card.module.css";

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
  const year = releaseYear(row.release_date);
  const typeLabel = mediaTypeLabel(row.media_type);

  return (
    <div className={styles.card}>
      <Link href={titlePath(row)} className={styles.link}>
        <div className={styles.posterWrap}>
          <Poster
            src={poster}
            alt={row.title}
            sizes="(max-width: 600px) 45vw, (max-width: 1000px) 22vw, 15vw"
            className={styles.poster}
            fallbackClassName={styles.posterFallback}
          />
        </div>
        <span className={styles.title}>{row.title}</span>
        <span className={styles.meta}>
          {year && <span>{year}</span>}
          <span>{typeLabel}</span>
        </span>
      </Link>
      <TitleActions
        titleRef={{ media_type: row.media_type, tmdb_id: row.tmdb_id }}
        userId={userId}
        initialState={state}
        unavailable={stateUnavailable}
      />
    </div>
  );
}
