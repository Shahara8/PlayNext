import Image from "next/image";
import Link from "next/link";
import type { CatalogRow } from "@/lib/catalog";
import { posterUrl } from "@/lib/tmdb-image";
import styles from "./title-card.module.css";

export default function TitleCard({ row }: { row: CatalogRow }) {
  const poster = posterUrl(row.poster_path);
  const year = row.release_date ? row.release_date.slice(0, 4) : null;
  const typeLabel = row.media_type === "tv" ? "TV Series" : "Movie";

  return (
    <Link href={`/title/${row.tmdb_id}`} className={styles.card}>
      <div className={styles.posterWrap}>
        {poster ? (
          <Image
            src={poster}
            alt={row.title}
            fill
            sizes="(max-width: 600px) 45vw, (max-width: 1000px) 22vw, 15vw"
            className={styles.poster}
          />
        ) : (
          <div className={styles.posterFallback}>{row.title}</div>
        )}
      </div>
      <span className={styles.title}>{row.title}</span>
      <span className={styles.meta}>
        {year && <span>{year}</span>}
        <span>{typeLabel}</span>
      </span>
    </Link>
  );
}
