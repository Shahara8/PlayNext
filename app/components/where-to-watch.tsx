import { useId, type CSSProperties } from "react";
import type { CatalogRow } from "@/lib/catalog";
import { getProviderByCode } from "@/lib/providers";
import {
  availabilityLabel,
  isIncluded,
  sortByAvailability,
} from "@/lib/availability";
import styles from "./where-to-watch.module.css";

type Row = Pick<
  CatalogRow,
  "availability_id" | "provider" | "availability_type" | "watch_url"
>;

/**
 * The "Where to watch" card: one row per service, subscription and free
 * first, each with a Watch button in the service's color (or "No direct link
 * yet"). Used by the title page; the home page's featured title reuses it.
 */
export default function WhereToWatch({ rows }: { rows: readonly Row[] }) {
  const headingId = useId();
  return (
    <section className={`card ${styles.card}`} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.heading}>
        Where to watch
      </h2>
      <ul className={styles.list}>
        {sortByAvailability(rows).map((row) => {
          const provider = getProviderByCode(row.provider);
          const name = provider?.label ?? row.provider;
          // An unknown provider code gets the accent for both the dot and the
          // button, so they agree.
          const serviceColors = {
            "--service-color": provider?.color ?? "var(--accent)",
            "--service-on": provider?.onColor ?? "var(--accent-contrast)",
          } as CSSProperties;
          return (
            <li
              key={row.availability_id}
              className={styles.item}
              style={serviceColors}
            >
              <span className={styles.service}>
                <span
                  className={styles.dot}
                  style={{ background: "var(--service-color)" }}
                  aria-hidden="true"
                />
                <span className={styles.name}>{name}</span>
              </span>
              <span
                className={
                  isIncluded(row.availability_type)
                    ? `${styles.availability} ${styles.included}`
                    : styles.availability
                }
              >
                {availabilityLabel(row.availability_type)}
              </span>
              {row.watch_url ? (
                <a
                  href={row.watch_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`btn btn-service ${styles.watch}`}
                  aria-label={`Watch on ${name} (opens in a new tab)`}
                >
                  Watch →
                </a>
              ) : (
                <span className={styles.noLink}>No direct link yet</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
