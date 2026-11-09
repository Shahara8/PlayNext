import styles from "./page.module.css";
import skeletonStyles from "./loading.module.css";

// The title page's shape (page.tsx): poster and title block, then Where to
// watch, the actions and the overview.
export default function TitleLoading() {
  return (
    <main className={styles.main}>
      <div className={styles.layout}>
        <div className={`skeleton ${skeletonStyles.poster}`} />
        <div className={styles.info}>
          <div className={styles.head}>
            <div className={`skeleton ${skeletonStyles.title}`} />
            <div className={`skeleton ${skeletonStyles.line}`} />
            <div className={`skeleton ${skeletonStyles.button}`} />
          </div>
          <div className={`skeleton ${skeletonStyles.whereToWatch}`} />
          <div className={`skeleton ${skeletonStyles.actions}`} />
          <div className={`skeleton ${skeletonStyles.overview}`} />
        </div>
      </div>
    </main>
  );
}
