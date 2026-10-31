/** First value of a Next.js searchParams entry (it's an array when a key repeats in the URL). */
export function firstSearchParam(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/**
 * The path (optionally with a `?query`) after setting/clearing one param on top of
 * `currentSearch`, preserving every other param — shared by every client component
 * that persists its state in the URL query string (sort/filter selects, search input).
 */
export function withUpdatedParam(
  currentSearch: string,
  pathname: string,
  key: string,
  value: string,
): string {
  const params = new URLSearchParams(currentSearch);
  if (value) params.set(key, value);
  else params.delete(key);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
