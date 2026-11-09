import type { CSSProperties } from "react";
import Link from "next/link";
import type { SearchResultRow } from "@/lib/search";
import { posterUrl } from "@/lib/tmdb-image";
import { mediaTypeLabel, ratingLabel, releaseYear } from "@/lib/format";
import { titlePath } from "@/lib/title-ref";
import { getProviderByCode, serviceColorVars } from "@/lib/providers";
import { availabilityLabel, sortByAvailability } from "@/lib/availability";
import Poster from "./poster";
import styles from "./search-result-card.module.css";

/**
 * A search result (docs/UI_DIRECTION.md Section 4, Search): the poster and
 * the title link to the title page, and below them one item per service: a
 * service-colored "Watch on <service> →" when there's a link, otherwise a
 * chip with the service and availability. The card itself isn't a link, so
 * no link sits inside another.
 */
export default function SearchResultCard({ row }: { row: SearchResultRow }) {
  const href = titlePath(row);
  const year = releaseYear(row.release_date);
  const rating = ratingLabel(row.vote_average);
  const meta = [year, mediaTypeLabel(row.media_type)].filter(Boolean);

  return (
    <article className={`card ${styles.card}`}>
      {/* The same destination as the title link, so it's skipped by the
          keyboard and screen readers rather than announced twice. */}
      <Link
        href={href}
        className={styles.posterWrap}
        tabIndex={-1}
        aria-hidden="true"
      >
        <Poster
          src={posterUrl(row.poster_path, "w185")}
          alt={row.title}
          decorative
          sizes="88px"
          className={styles.poster}
          fallbackClassName={styles.posterFallback}
        />
      </Link>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <Link href={href} className={styles.titleLink}>
            {row.title}
          </Link>
        </h2>
        <p className={styles.meta}>
          {meta.join(" · ")}
          {rating && (
            <>
              {" · "}
              <span className={styles.rating}>
                <span aria-hidden="true">★ </span>
                <span className="sr-only">TMDB rating </span>
                {rating}
              </span>
            </>
          )}
        </p>
      </div>
      {row.providers.length > 0 ? (
        <ul className={styles.services} aria-label="Where to watch">
          {sortByAvailability(row.providers).map((p, i) => (
            <li key={`${p.provider}-${p.availability_type}-${i}`}>
              <Service provider={p} />
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.unavailable}>
          Not currently available on any tracked provider
        </p>
      )}
    </article>
  );
}

function Service({
  provider: p,
}: {
  provider: SearchResultRow["providers"][number];
}) {
  const meta = getProviderByCode(p.provider);
  const name = meta?.label ?? p.provider;
  const availability = availabilityLabel(p.availability_type);
  const colors = serviceColorVars(meta) as CSSProperties;

  if (p.watch_url) {
    return (
      <a
        href={p.watch_url}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-service"
        style={colors}
        aria-label={`Watch on ${name}, ${availability} (opens in a new tab)`}
      >
        Watch on {name} →
      </a>
    );
  }
  return (
    <span className={`chip ${styles.chip}`} style={colors}>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.chipName}>{name}</span>
      <span aria-hidden="true">·</span>
      {availability}
    </span>
  );
}
