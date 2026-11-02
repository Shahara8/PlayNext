import styles from "./page.module.css";
import skeletonStyles from "./loading.module.css";

export default function MyListLoading() {
  return (
    <main className={styles.main}>
      <div className={`skeleton ${skeletonStyles.titleSkeleton}`} />
      <div className={`skeleton ${skeletonStyles.tabsSkeleton}`} />
      <div className={styles.grid}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`skeleton ${skeletonStyles.posterSkeleton}`}
          />
        ))}
      </div>
    </main>
  );
}
