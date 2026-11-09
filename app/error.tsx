"use client";

import Link from "next/link";
import { useEffect } from "react";
import styles from "./status-page.module.css";

// Error boundary for every page under the root layout (which keeps the header
// visible). Server errors arrive with a generic message in production, so
// none is shown; the digest matches the server log's entry for the error.
// Not named `Error`: that would shadow the global the digest check uses.
export default function ErrorPage({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  // Errors thrown in the browser never reach the server log.
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest =
    error instanceof Error &&
    "digest" in error &&
    typeof error.digest === "string"
      ? error.digest
      : null;

  return (
    <main className={styles.main}>
      <h1>Something went wrong</h1>
      <p className={styles.message}>
        We couldn&apos;t load this page. It&apos;s usually temporary.
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => retry()}
        >
          Try again
        </button>
        <Link href="/" className="btn btn-secondary">
          Back to home
        </Link>
      </div>
      {digest && <p className={styles.reference}>Reference: {digest}</p>}
    </main>
  );
}
