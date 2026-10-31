import styles from "./page.module.css";
import skeletonStyles from "./loading.module.css";

export default function SearchLoading() {
  return (
    <main className={styles.main}>
      <div className={`skeleton ${skeletonStyles.titleSkeleton}`} />
      <div className={`skeleton ${skeletonStyles.barSkeleton}`} />
      <div className={styles.results}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={skeletonStyles.cardSkeleton}>
            <div className={`skeleton ${skeletonStyles.posterSkeleton}`} />
            <div className={skeletonStyles.lines}>
              <div className={`skeleton ${skeletonStyles.lineSkeleton}`} />
              <div className={`skeleton ${skeletonStyles.lineSkeletonShort}`} />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
