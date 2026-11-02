"use client";

import "./globals.css";
import styles from "./status-page.module.css";

// Only errors in the root layout itself land here (everything below it is
// caught by app/error.tsx). It replaces the layout, so it brings its own
// <html>/<body> and the global styles, and can't export metadata.
export default function GlobalError({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <title>Something went wrong · PlayNext</title>
        <main className={styles.main}>
          <h1>Something went wrong</h1>
          <p className={styles.message}>
            PlayNext couldn&apos;t load. It&apos;s usually temporary.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.button}
              onClick={() => retry()}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
