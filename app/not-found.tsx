import type { Metadata } from "next";
import Link from "next/link";
import { NOT_FOUND_METADATA } from "@/lib/seo";
import styles from "./status-page.module.css";

// Unknown URLs, plus notFound() from the browse (unknown provider) and title
// detail (unknown or no-longer-available title) pages.
export const metadata: Metadata = NOT_FOUND_METADATA;

export default function NotFound() {
  return (
    <main className={styles.main}>
      <h1>Not found</h1>
      <p className={styles.message}>
        That page doesn&apos;t exist, or the title is no longer available on any
        service we track.
      </p>
      <div className={styles.actions}>
        <Link href="/" className="btn btn-secondary">
          Back to home
        </Link>
        <Link href="/search" className="btn btn-secondary">
          Search the catalog
        </Link>
      </div>
    </main>
  );
}
