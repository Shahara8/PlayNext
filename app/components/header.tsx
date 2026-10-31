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
          <Link href="/" className={styles.link}>
            Browse
          </Link>
          <Link href="/search" className={styles.link}>
            Search
          </Link>
          <span className={styles.linkPlaceholder}>My List</span>
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
