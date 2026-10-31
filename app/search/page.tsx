import { searchTitles } from "@/lib/search";
import SearchBar from "@/app/components/search-bar";
import SearchResultCard from "@/app/components/search-result-card";
import { firstSearchParam } from "@/lib/query-params";
import styles from "./page.module.css";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const q = firstSearchParam(sp.q).trim();
  const results = q ? await searchTitles(q) : [];

  return (
    <main className={styles.main}>
      <h1>Search</h1>
      <SearchBar initialQuery={q} />
      {!q ? (
        <p className={styles.empty}>Start typing to search the catalog.</p>
      ) : results.length === 0 ? (
        <p className={styles.empty}>No results for &ldquo;{q}&rdquo;.</p>
      ) : (
        <ul className={styles.results}>
          {results.map((row) => (
            <li key={row.tmdb_id}>
              <SearchResultCard row={row} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
