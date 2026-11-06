import styles from "./page.module.css";
import skeletonStyles from "./loading.module.css";

export default function TitleLoading() {
  return (
    <main className={styles.main}>
      <div className={styles.layout}>
        <div className={`skeleton ${skeletonStyles.posterSkeleton}`} />
        <div className={styles.info}>
          <div className={`skeleton ${skeletonStyles.titleSkeleton}`} />
          <div className={`skeleton ${skeletonStyles.lineSkeleton}`} />
          <div className={`skeleton ${skeletonStyles.lineSkeleton}`} />
          <div className={`skeleton ${skeletonStyles.blockSkeleton}`} />
        </div>
      </div>
    </main>
  );
}
