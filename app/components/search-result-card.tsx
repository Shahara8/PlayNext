import Link from "next/link";
import type { SearchResultRow } from "@/lib/search";
import { posterUrl } from "@/lib/tmdb-image";
import { mediaTypeLabel, releaseYear } from "@/lib/format";
import { titlePath } from "@/lib/title-ref";
import ProviderBadges from "./provider-badges";
import Poster from "./poster";
import styles from "./search-result-card.module.css";

export default function SearchResultCard({ row }: { row: SearchResultRow }) {
  const poster = posterUrl(row.poster_path, "w185");
  const year = releaseYear(row.release_date);
  const typeLabel = mediaTypeLabel(row.media_type);

  return (
    <Link href={titlePath(row)} className={styles.card}>
      <div className={styles.posterWrap}>
        <Poster
          src={poster}
          alt={row.title}
          sizes="80px"
          className={styles.poster}
          fallbackClassName={styles.posterFallback}
        />
      </div>
      <div className={styles.info}>
        <span className={styles.title}>{row.title}</span>
        <span className={styles.meta}>
          {year && <span>{year}</span>}
          <span>{typeLabel}</span>
          {row.vote_average != null && (
            <span>★ {row.vote_average.toFixed(1)}</span>
          )}
        </span>
        {row.providers.length > 0 ? (
          <ProviderBadges providers={row.providers} />
        ) : (
          <span className={styles.unavailable}>
            Not currently available on any tracked provider
          </span>
        )}
      </div>
    </Link>
  );
}
