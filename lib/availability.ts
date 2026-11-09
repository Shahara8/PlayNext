// How a title's "Where to watch" rows are ordered and labeled
// (docs/UI_DIRECTION.md Section 4, title page). Pure, so it's unit-tested.

import type { CatalogRow } from "./catalog";

export type AvailabilityType = CatalogRow["availability_type"];

// Included with a subscription or free first, then pay-per-title.
const RANK: Record<AvailabilityType, number> = {
  subscription: 0,
  free: 1,
  rent: 2,
  buy: 3,
};

const LABEL: Record<AvailabilityType, string> = {
  subscription: "Subscription",
  free: "Free",
  rent: "Rent",
  buy: "Buy",
};

/** "Subscription", "Free", "Rent", "Buy"; an unknown kind as it came. */
export function availabilityLabel(type: AvailabilityType): string {
  return Object.hasOwn(LABEL, type) ? LABEL[type] : type;
}

/** Watching costs nothing extra (shown in the success color). */
export function isIncluded(type: AvailabilityType): boolean {
  return type === "subscription" || type === "free";
}

/**
 * Subscription, then free, then rent, then buy. Rows of the same kind keep
 * their input order (the stable order getCatalogByTitle returns). Returns a
 * new array; the input isn't changed. An unknown kind (the view's type is
 * looser at runtime than in TypeScript) sorts last.
 */
export function sortByAvailability<
  T extends { availability_type: AvailabilityType },
>(rows: readonly T[]): T[] {
  const rank = (row: T) =>
    Object.hasOwn(RANK, row.availability_type)
      ? RANK[row.availability_type]
      : Number.MAX_VALUE;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => rank(a.row) - rank(b.row) || a.index - b.index)
    .map(({ row }) => row);
}
