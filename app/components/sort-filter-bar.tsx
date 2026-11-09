"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  SORT_OPTIONS,
  TYPE_OPTIONS,
  AVAILABILITY_OPTIONS,
  type SortKey,
} from "@/lib/catalog";
import { withUpdatedParam } from "@/lib/query-params";
import styles from "./sort-filter-bar.module.css";

export default function SortFilterBar({
  sort,
  type,
  availabilityType,
  genre,
  genres,
}: {
  sort: SortKey;
  type: string;
  availabilityType: string;
  genre: string;
  genres: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(key: string, value: string) {
    router.push(
      withUpdatedParam(searchParams.toString(), pathname, key, value),
    );
  }

  // A genre from the URL that the provider's list lacks (an old link) still
  // shows as selected, so the select matches what the grid is filtered by.
  const genreOptions =
    genre && !genres.includes(genre) ? [...genres, genre] : genres;

  return (
    <div className={styles.bar}>
      <label className={styles.field}>
        <span>Sort</span>
        <select
          className="select"
          value={sort}
          onChange={(e) => update("sort", e.target.value)}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span>Type</span>
        <select
          className="select"
          value={type}
          onChange={(e) => update("type", e.target.value)}
        >
          <option value="">All</option>
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span>Availability</span>
        <select
          className="select"
          value={availabilityType}
          onChange={(e) => update("avail", e.target.value)}
        >
          <option value="">All</option>
          {AVAILABILITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {/* Always shown, so the bar keeps its 2×2 shape (a service with no
            titles yet has just "All"). */}
      <label className={styles.field}>
        <span>Genre</span>
        <select
          className="select"
          value={genre}
          onChange={(e) => update("genre", e.target.value)}
        >
          <option value="">All</option>
          {genreOptions.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
