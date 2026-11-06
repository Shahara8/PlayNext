import Link from "next/link";
import { Suspense } from "react";
import AuthNav from "./auth-nav";
import styles from "./header.module.css";

export default function Header() {
  return (
    <header className={styles.header}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.logo}>
          PlayNext
        </Link>
        <div className={styles.links}>
          {/* Same target as the logo, so phones drop it to fit one row. */}
          <Link href="/" className={`${styles.link} ${styles.browseLink}`}>
            Browse
          </Link>
          <Link href="/search" className={styles.link}>
            Search
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
