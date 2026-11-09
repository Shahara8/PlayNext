import type { Metadata } from "next";
import Link from "next/link";
import { resultsLine, searchTitles, showsClosestMatches } from "@/lib/search";
import SearchBar from "@/app/components/search-bar";
import SearchResultCard from "@/app/components/search-result-card";
import { firstSearchParam } from "@/lib/query-params";
import { titleKey } from "@/lib/title-ref";
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
      <div className={styles.top}>
        <h1>Search</h1>
        <SearchBar initialQuery={q} />
      </div>
      {!q ? (
        <p className={styles.empty}>Start typing to search the catalog.</p>
      ) : results.length === 0 ? (
        <div className="card empty-state" role="status" data-empty-state>
          <h2>No results for &ldquo;{q}&rdquo;</h2>
          <p>
            Check the spelling, try fewer words, or{" "}
            <Link href="/" className="text-link">
              browse by service
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className={styles.section}>
          <p className={styles.resultsLine} role="status" data-results-line>
            <span className={styles.count}>
              {resultsLine(results.length, q)}
            </span>
            {showsClosestMatches(q, results) && (
              <span className={styles.closest}>Showing closest matches</span>
            )}
          </p>
          <ul className={styles.results}>
            {results.map((row) => (
              <li key={titleKey(row)}>
                <SearchResultCard row={row} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
