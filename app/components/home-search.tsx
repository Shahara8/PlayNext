import SearchIcon from "./search-icon";
import styles from "./search-field.module.css";

// The home page's search: a plain GET form, so it works before JavaScript
// loads and lands on /search?q=… (the search page takes over from there).
// The page's heading, "Where can I watch…", reads as the field's question.
// The search page's SearchBar has the same look.
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
        <SearchIcon size={18} />
        Search
      </button>
    </form>
  );
}
