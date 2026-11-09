import {
  AVAILABILITY_OPTIONS,
  DEFAULT_SORT,
  SORT_OPTIONS,
  TYPE_OPTIONS,
  type CatalogFilters,
  type CatalogRow,
  type SortKey,
} from "./catalog";
import { firstSearchParam, withUpdatedParam } from "./query-params";

/** A browse page's state, read from `/browse/<slug>?sort=&type=&avail=&genre=`. */
export interface BrowseParams {
  sort: SortKey;
  filters: CatalogFilters;
}

const SORT_KEYS: readonly string[] = SORT_OPTIONS.map((o) => o.value);
const TYPE_VALUES: readonly string[] = TYPE_OPTIONS.map((o) => o.value);
const AVAILABILITY_VALUES: readonly string[] = AVAILABILITY_OPTIONS.map(
  (o) => o.value,
);

/**
 * The browse page's sort and filters from its query. An unknown sort falls
 * back to the default and an unknown type or availability is ignored, so a
 * bad link shows the whole catalog instead of an error. Any genre is kept
 * (the genre list is the provider's, read separately).
 */
export function parseBrowseParams(searchParams: {
  [key: string]: string | string[] | undefined;
}): BrowseParams {
  const sortRaw = firstSearchParam(searchParams.sort);
  const typeRaw = firstSearchParam(searchParams.type);
  const availRaw = firstSearchParam(searchParams.avail);
  const genre = firstSearchParam(searchParams.genre);
  return {
    sort: SORT_KEYS.includes(sortRaw) ? (sortRaw as SortKey) : DEFAULT_SORT,
    filters: {
      type: TYPE_VALUES.includes(typeRaw)
        ? (typeRaw as CatalogRow["type"])
        : undefined,
      availabilityType: AVAILABILITY_VALUES.includes(availRaw)
        ? (availRaw as CatalogRow["availability_type"])
        : undefined,
      genre: genre || undefined,
    },
  };
}

/** Whether any filter narrows the list (sort isn't a filter). */
export function hasActiveFilters(filters: CatalogFilters): boolean {
  return Boolean(filters.type || filters.availabilityType || filters.genre);
}

/**
 * "Clear filters": the provider's browse page without its filters, keeping
 * the sort (it orders the list rather than narrowing it). The default sort
 * leaves the URL bare.
 */
export function clearFiltersHref(providerSlug: string, sort: SortKey): string {
  return withUpdatedParam(
    "",
    `/browse/${providerSlug}`,
    "sort",
    sort === DEFAULT_SORT ? "" : sort,
  );
}

/** The empty panel's copy and its one action (the shared .empty-state). */
export type BrowseEmptyCopy = {
  line: string;
  hint: string;
  action: { label: string; href: string; clearsFilters: boolean };
};

/**
 * What the browse page says when it has no titles to show. With filters
 * (`clearHref` set), nothing matched them, and the action clears them,
 * keeping the sort; without, the service has no titles at all, and the
 * action goes home to the other services.
 */
export function browseEmptyCopy(
  providerLabel: string,
  clearHref: string | null,
): BrowseEmptyCopy {
  return clearHref !== null
    ? {
        line: "Nothing matches these filters",
        hint: "Try a different type, availability or genre.",
        action: {
          label: "Clear filters",
          href: clearHref,
          clearsFilters: true,
        },
      }
    : {
        line: `Nothing available on ${providerLabel} yet`,
        hint: "Its titles will show here once we have them.",
        action: {
          label: "Browse other services",
          href: "/",
          clearsFilters: false,
        },
      };
}
