"use client";

import "./globals.css";
import { themeInitScript } from "@/lib/theme";
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
    // The theme script and suppressHydrationWarning as in app/layout.tsx,
    // so a stored Light/Dark choice holds here too.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
      </head>
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
              className="btn btn-primary"
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
