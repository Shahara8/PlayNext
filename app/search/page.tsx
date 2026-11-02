import type { Metadata } from "next";
import Link from "next/link";
import { searchTitles } from "@/lib/search";
import SearchBar from "@/app/components/search-bar";
import SearchResultCard from "@/app/components/search-result-card";
import { firstSearchParam } from "@/lib/query-params";
import { searchMetadata } from "@/lib/seo";
import styles from "./page.module.css";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  return searchMetadata(firstSearchParam((await searchParams).q).trim());
}

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
        <p className={styles.empty}>
          No results for &ldquo;{q}&rdquo;. Check the spelling, try fewer words,
          or{" "}
          <Link href="/" className={styles.emptyLink}>
            browse by service
          </Link>
          .
        </p>
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
