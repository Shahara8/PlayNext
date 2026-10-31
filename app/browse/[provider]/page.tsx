import { notFound } from "next/navigation";
import { getProviderBySlug } from "@/lib/providers";
import {
  getCatalogByProvider,
  getProviderGenres,
  SORT_OPTIONS,
  TYPE_OPTIONS,
  AVAILABILITY_OPTIONS,
  type CatalogRow,
  type SortKey,
} from "@/lib/catalog";
import TitleCard from "@/app/components/title-card";
import SortFilterBar from "@/app/components/sort-filter-bar";
import styles from "./page.module.css";

const SORT_KEYS = SORT_OPTIONS.map((o) => o.value) as string[];
const TYPE_VALUES = TYPE_OPTIONS.map((o) => o.value);
const AVAILABILITY_VALUES = AVAILABILITY_OPTIONS.map((o) => o.value);

function firstValue(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
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

  const sp = await searchParams;
  const sortRaw = firstValue(sp.sort);
  const sort: SortKey = SORT_KEYS.includes(sortRaw)
    ? (sortRaw as SortKey)
    : "trending";

  const typeRaw = firstValue(sp.type);
  const type = TYPE_VALUES.includes(typeRaw as CatalogRow["type"])
    ? (typeRaw as CatalogRow["type"])
    : undefined;

  const availRaw = firstValue(sp.avail);
  const availabilityType = AVAILABILITY_VALUES.includes(
    availRaw as CatalogRow["availability_type"],
  )
    ? (availRaw as CatalogRow["availability_type"])
    : undefined;

  const genre = firstValue(sp.genre) || undefined;

  const [rows, genres] = await Promise.all([
    getCatalogByProvider(provider.code, {
      sort,
      filters: { type, availabilityType, genre },
    }),
    getProviderGenres(provider.code),
  ]);

  const filtersActive = Boolean(type || availabilityType || genre);

  return (
    <main className={styles.main}>
      <h1>{provider.label}</h1>
      <SortFilterBar
        sort={sort}
        type={type ?? ""}
        availabilityType={availabilityType ?? ""}
        genre={genre ?? ""}
        genres={genres}
      />
      {rows.length === 0 ? (
        <p className={styles.empty}>
          {filtersActive
            ? "Nothing matches these filters."
            : `Nothing available on ${provider.label} yet.`}
        </p>
      ) : (
        <div className={styles.grid}>
          {rows.map((row) => (
            <TitleCard key={row.availability_id} row={row} />
          ))}
        </div>
      )}
    </main>
  );
}
