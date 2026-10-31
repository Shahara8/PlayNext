import Image from "next/image";
import Link from "next/link";
import type { SearchResultRow } from "@/lib/search";
import { posterUrl } from "@/lib/tmdb-image";
import { mediaTypeLabel, releaseYear } from "@/lib/format";
import ProviderBadges from "./provider-badges";
import styles from "./search-result-card.module.css";

export default function SearchResultCard({ row }: { row: SearchResultRow }) {
  const poster = posterUrl(row.poster_path, "w185");
  const year = releaseYear(row.release_date);
  const typeLabel = mediaTypeLabel(row.media_type);

  return (
    <Link href={`/title/${row.tmdb_id}`} className={styles.card}>
      <div className={styles.posterWrap}>
        {poster ? (
          <Image
            src={poster}
            alt={row.title}
            fill
            sizes="80px"
            className={styles.poster}
          />
        ) : (
          <div className={styles.posterFallback}>{row.title}</div>
        )}
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
