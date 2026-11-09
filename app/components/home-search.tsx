import styles from "./home-search.module.css";

// The home page's search: a plain GET form, so it works before JavaScript
// loads and lands on /search?q=… (the search page takes over from there).
// The page's heading, "Where can I watch…", reads as the field's question.
export default function HomeSearch() {
  return (
    <form action="/search" role="search" className={styles.form}>
      <label htmlFor="home-search" className="sr-only">
        Search for a movie or show
      </label>
      <input
        id="home-search"
        type="search"
        name="q"
        className={`input ${styles.input}`}
        placeholder="e.g. Stranger Things"
        autoComplete="off"
        enterKeyHint="search"
      />
      <button type="submit" className={`btn btn-primary ${styles.button}`}>
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        Search
      </button>
    </form>
  );
}
