"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { withUpdatedParam } from "@/lib/query-params";
import SearchIcon from "./search-icon";
import styles from "./search-field.module.css";

const DEBOUNCE_MS = 300;

// The search page's field: the home page's look (HomeSearch), but results
// update as you type, after a short pause. It's still a GET form to
// /search?q=…, so Enter works before JavaScript loads; after that, Enter or
// the button commits the query at once instead of waiting for the pause.
export default function SearchBar({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initialQuery);
  // The query this component last committed to the URL; typing commits
  // (after the pause) only when the trimmed value differs from it.
  const [lastCommittedQuery, setLastCommittedQuery] = useState(initialQuery);
  // The queries this component committed itself (the last few), so an
  // `initialQuery` update from one of its own navigations landing can be
  // told apart from a genuinely external change (back/forward nav, a shared
  // link). Only the latter replaces the field's text: otherwise, between a
  // commit and its navigation landing (or a slow response for an earlier
  // pause), the field would snap back and lose what was typed meanwhile.
  const [ownQueries, setOwnQueries] = useState<string[]>([initialQuery]);
  const [prevInitialQuery, setPrevInitialQuery] = useState(initialQuery);
  // The pending debounce timer, so Enter can cancel it.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Set directly during render (React's "adjusting state when a prop
  // changes" pattern) rather than in an effect, which would cause an extra
  // render after the one that already reflects the new value.
  if (initialQuery !== prevInitialQuery) {
    setPrevInitialQuery(initialQuery);
    if (!ownQueries.includes(initialQuery)) {
      setOwnQueries([initialQuery]);
      setLastCommittedQuery(initialQuery);
      setValue(initialQuery);
    }
  }

  function commit(trimmed: string) {
    clearTimeout(timer.current);
    setLastCommittedQuery(trimmed);
    setOwnQueries((own) => [...own.slice(-4), trimmed]);
    // `replace`, not `push` — committing on every debounced pause during
    // normal typing would otherwise bury `/search` under several stale
    // intermediate queries in browser history. Read the query string fresh
    // here (not from a closed-over `useSearchParams()` value) so a param
    // that changed during the debounce window isn't silently reverted.
    router.replace(
      withUpdatedParam(window.location.search.slice(1), pathname, "q", trimmed),
    );
  }

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === lastCommittedQuery) return;

    timer.current = setTimeout(() => commit(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = value.trim();
    // commit() also cancels the pending pause, so it doesn't commit again.
    if (trimmed !== lastCommittedQuery) commit(trimmed);
    // Done typing: on a phone this closes the keyboard so the results show.
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  }

  return (
    <form
      action="/search"
      role="search"
      className={styles.form}
      onSubmit={onSubmit}
    >
      <label htmlFor="search-page-q" className="sr-only">
        Search for a movie or show
      </label>
      <input
        id="search-page-q"
        type="search"
        name="q"
        className={`input ${styles.input}`}
        placeholder="e.g. Stranger Things"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        enterKeyHint="search"
        // Only on an empty page: with results showing, a phone keyboard
        // popping up would cover them.
        autoFocus={!initialQuery}
      />
      <button type="submit" className={`btn btn-primary ${styles.button}`}>
        <SearchIcon size={18} />
        Search
      </button>
    </form>
  );
}
