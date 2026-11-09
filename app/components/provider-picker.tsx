import Link from "next/link";
import { connection } from "next/server";
import type { CSSProperties } from "react";
import { getProviderSummaries, type ProviderSummary } from "@/lib/catalog";
import { titleCountLabel } from "@/lib/format";
import { PROVIDERS } from "@/lib/providers";
import { titleKey } from "@/lib/title-ref";
import { ScrollRow } from "./scroll-row";
import styles from "./provider-picker.module.css";

const HEADING_ID = "services-heading";

/**
 * The home page's service tiles: dot, name, "N titles" and the two most
 * popular titles, each linking to /browse/<slug>. Without `summaries` (still
 * loading, or the read failed) the tiles show just the names, so they can be
 * used either way; `loading` draws placeholder lines for the counts.
 */
export function ProviderTiles({
  summaries,
  loading = false,
}: {
  summaries?: ReadonlyMap<string, ProviderSummary>;
  loading?: boolean;
}) {
  return (
    <section className={styles.section} aria-labelledby={HEADING_ID}>
      <h2 id={HEADING_ID}>Browse by service</h2>
      <ScrollRow className={styles.row}>
        {PROVIDERS.map((provider) => {
          const summary = summaries?.get(provider.code);
          return (
            <li key={provider.code} className={styles.item}>
              <Link
                href={`/browse/${provider.slug}`}
                className={`card ${styles.tile}`}
                style={{ "--service-color": provider.color } as CSSProperties}
              >
                <span className={styles.name}>
                  <span className={styles.dot} aria-hidden="true" />
                  {provider.label}
                </span>
                {summary ? (
                  <>
                    <span className={styles.count}>
                      {titleCountLabel(summary.count)}
                    </span>
                    {summary.samples.map((sample) => (
                      <span key={titleKey(sample)} className={styles.sample}>
                        {sample.title}
                      </span>
                    ))}
                  </>
                ) : (
                  loading && (
                    <span
                      className={`skeleton ${styles.countSkeleton}`}
                      aria-hidden="true"
                    />
                  )
                )}
              </Link>
            </li>
          );
        })}
      </ScrollRow>
    </section>
  );
}

// Reads per request, like ForYou: the catalog changes daily, and the shell
// above (search) stays prerendered.
export default async function ProviderPicker() {
  await connection();
  let summaries: Map<string, ProviderSummary> | undefined;
  try {
    const list = await getProviderSummaries(PROVIDERS);
    summaries = new Map(list.map((summary) => [summary.code, summary]));
  } catch (error) {
    // The names still link to each service.
    console.error(error);
  }
  return <ProviderTiles summaries={summaries} />;
}
