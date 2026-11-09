import type { Metadata } from "next";
import Link from "next/link";
import { NOT_FOUND_METADATA } from "@/lib/seo";
import styles from "./components/center-card.module.css";

// Unknown URLs, plus notFound() from the browse (unknown provider) and title
// detail (unknown or no-longer-available title) pages.
export const metadata: Metadata = NOT_FOUND_METADATA;

export default function NotFound() {
  return (
    <main className={styles.main}>
      <div className={`card ${styles.card}`}>
        <h1>Not found</h1>
        <p className={styles.lead}>
          That page doesn&apos;t exist, or the title is no longer available on
          any service we track.
        </p>
        <div className={styles.actions}>
          <Link href="/" className="btn btn-primary">
            Back to home
          </Link>
          <Link href="/search" className="btn btn-secondary">
            Search the catalog
          </Link>
        </div>
      </div>
    </main>
  );
}
