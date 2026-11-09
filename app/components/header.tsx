import Link from "next/link";
import { Suspense } from "react";
import AuthNav from "./auth-nav";
import SearchIcon from "./search-icon";
import styles from "./header.module.css";

// docs/UI_DIRECTION.md Section 4 "Header and footer": logo · search icon ·
// (Browse on desktop) · My List · Sign in, or first name plus Sign out.
export default function Header() {
  return (
    <header className={styles.header}>
      <nav className={styles.nav} aria-label="Main">
        <Link href="/" className={styles.logo}>
          PlayNext
        </Link>
        <div className={styles.links}>
          <Link
            href="/search"
            className={`${styles.link} ${styles.iconLink}`}
            aria-label="Search"
            title="Search"
          >
            <SearchIcon />
          </Link>
          {/* Same target as the logo, so phones drop it to fit one row. */}
          <Link href="/" className={`${styles.link} ${styles.browseLink}`}>
            Browse
          </Link>
          <Link href="/my-list" className={styles.link}>
            My List
          </Link>
          <Suspense
            fallback={<span className={`skeleton ${styles.authNavSkeleton}`} />}
          >
            <AuthNav />
          </Suspense>
        </div>
      </nav>
    </header>
  );
}
