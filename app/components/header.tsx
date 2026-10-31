import Link from "next/link";
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
          <span className={styles.linkPlaceholder}>Sign in</span>
        </div>
      </nav>
    </header>
  );
}
