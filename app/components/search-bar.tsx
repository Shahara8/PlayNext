"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { withUpdatedParam } from "@/lib/query-params";
import styles from "./search-bar.module.css";

const DEBOUNCE_MS = 300;

export default function SearchBar({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initialQuery);
  // Tracks the query this component itself last committed to the URL, so an
  // `initialQuery` update can be told apart from a genuinely external change
  // (back/forward nav, a shared link): without that distinction, a slow
  // navigation response finally landing for an earlier keystroke would snap
  // `value` back and discard anything typed in the meantime.
  const [lastCommittedQuery, setLastCommittedQuery] = useState(initialQuery);

  // Set directly during render (React's "adjusting state when a prop
  // changes" pattern) rather than in an effect, which would cause an extra
  // render after the one that already reflects the new value.
  if (initialQuery !== lastCommittedQuery) {
    setLastCommittedQuery(initialQuery);
    if (value !== initialQuery) setValue(initialQuery);
  }

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === lastCommittedQuery) return;

    const timer = setTimeout(() => {
      setLastCommittedQuery(trimmed);
      // `replace`, not `push` — committing on every debounced pause during
      // normal typing would otherwise bury `/search` under several stale
      // intermediate queries in browser history. Read the query string fresh
      // here (not from a closed-over `useSearchParams()` value) so a param
      // that changed during the debounce window isn't silently reverted.
      router.replace(
        withUpdatedParam(
          window.location.search.slice(1),
          pathname,
          "q",
          trimmed,
        ),
      );
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="search"
      className={styles.input}
      placeholder="Search for a movie or show…"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      autoFocus
    />
  );
}
