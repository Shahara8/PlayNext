import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProviderBySlug } from "@/lib/providers";
import { getCatalogByProvider, getProviderFacets } from "@/lib/catalog";
import {
  clearFiltersHref,
  hasActiveFilters,
  parseBrowseParams,
} from "@/lib/browse";
import { browseCountLabel } from "@/lib/format";
import TitleCard from "@/app/components/title-card";
import SortFilterBar from "@/app/components/sort-filter-bar";
import { getViewerTitleStates } from "@/lib/viewer-titles";
import { titleKey } from "@/lib/title-ref";
import { browseMetadata, NOT_FOUND_METADATA } from "@/lib/seo";
import styles from "./page.module.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ provider: string }>;
}): Promise<Metadata> {
  const provider = getProviderBySlug((await params).provider);
  // Unknown provider: the page calls notFound(), which sets noindex.
  return provider ? browseMetadata(provider) : NOT_FOUND_METADATA;
}

export default async function BrowsePage({
  params,
  searchParams,
}: {
  params: Promise<{ provider: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { provider: slug } = await params;
  const provider = getProviderBySlug(slug);
  if (!provider) notFound();

  const { sort, filters } = parseBrowseParams(await searchParams);

  const [rows, facets] = await Promise.all([
    getCatalogByProvider(provider.code, { sort, filters }),
    getProviderFacets(provider.code),
  ]);

  const { userId, states, unavailable } = await getViewerTitleStates(rows);

  const filtered = hasActiveFilters(filters);
  const clearHref = filtered ? clearFiltersHref(provider.slug, sort) : null;
  // With nothing to show, the empty panel's own link is the one.
  const clearInCountLine = clearHref !== null && rows.length > 0;

  return (
    <main className={styles.main}>
      <div
        className={styles.top}
        style={{ "--service-color": provider.color } as CSSProperties}
      >
        <h1 className={styles.title}>
          <span className={styles.dot} aria-hidden="true" />
          {provider.label}
        </h1>
        <p className={styles.countLine}>
          <span data-browse-count>
            {browseCountLabel(rows.length, facets.total, filtered)}
          </span>
          {clearInCountLine && (
            <>
              <span aria-hidden="true">·</span>
              <Link
                href={clearHref}
                className={`text-link ${styles.clear}`}
                data-clear-filters
              >
                Clear filters
              </Link>
            </>
          )}
        </p>
      </div>
      <SortFilterBar
        sort={sort}
        type={filters.type ?? ""}
        availabilityType={filters.availabilityType ?? ""}
        genre={filters.genre ?? ""}
        genres={facets.genres}
      />
      {rows.length === 0 ? (
        <div className={`card ${styles.empty}`}>
          {clearHref ? (
            <p>
              Nothing matches these filters.{" "}
              <Link href={clearHref} className="text-link" data-clear-filters>
                Clear filters
              </Link>
            </p>
          ) : (
            <p>{`Nothing available on ${provider.label} yet.`}</p>
          )}
        </div>
      ) : (
        <div className="title-grid">
          {rows.map((row) => (
            <TitleCard
              key={row.availability_id}
              row={row}
              userId={userId}
              state={states.get(titleKey(row))}
              stateUnavailable={unavailable}
            />
          ))}
        </div>
      )}
    </main>
  );
}
