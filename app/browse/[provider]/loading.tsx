import styles from "./page.module.css";
import skeletonStyles from "./loading.module.css";

export default function BrowseLoading() {
  return (
    <main className={styles.main}>
      <div className={`skeleton ${skeletonStyles.titleSkeleton}`} />
      <div className={`skeleton ${skeletonStyles.barSkeleton}`} />
      <div className={styles.grid}>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className={skeletonStyles.cardSkeleton}>
            <div className={`skeleton ${skeletonStyles.posterSkeleton}`} />
            <div className={`skeleton ${skeletonStyles.lineSkeleton}`} />
          </div>
        ))}
      </div>
    </main>
  );
}
