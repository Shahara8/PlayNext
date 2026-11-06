import Link from "next/link";
import { PRIVACY_PATH, SITE_NAME } from "@/lib/seo";
import styles from "./footer.module.css";

// Site-wide footer. Google's OAuth review expects the homepage to link to
// the privacy policy, so this link must stay on every page, home included.
export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <span>{SITE_NAME}</span>
        <Link href={PRIVACY_PATH} className={styles.link}>
          Privacy
        </Link>
        <span>
          Title data from{" "}
          <a
            href="https://www.themoviedb.org/"
            className={styles.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            TMDB
          </a>
        </span>
      </div>
    </footer>
  );
}
