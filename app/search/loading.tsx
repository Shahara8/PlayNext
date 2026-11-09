import styles from "./page.module.css";
import skeletonStyles from "./loading.module.css";

// The search page's shape while results load: the heading, the field, the
// results line and a few result cards.
export default function SearchLoading() {
  return (
    <main className={styles.main}>
      <div className={styles.top}>
        <div className={`skeleton ${skeletonStyles.titleSkeleton}`} />
        <div className={`skeleton ${skeletonStyles.barSkeleton}`} />
      </div>
      <div className={styles.section}>
        <div className={`skeleton ${skeletonStyles.lineSkeleton}`} />
        <div className={styles.results}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`card ${skeletonStyles.cardSkeleton}`}>
              <div className={`skeleton ${skeletonStyles.posterSkeleton}`} />
              <div className={skeletonStyles.lines}>
                <div className={`skeleton ${skeletonStyles.titleLine}`} />
                <div className={`skeleton ${skeletonStyles.metaLine}`} />
                <div className={`skeleton ${skeletonStyles.buttonSkeleton}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
