import { TitleCardSkeleton } from "@/app/components/title-card";
import styles from "./page.module.css";
import barStyles from "@/app/components/sort-filter-bar.module.css";
import skeletonStyles from "./loading.module.css";

/** The browse page's shape: title, count, the four selects, then the grid. */
export default function BrowseLoading() {
  return (
    <main className={styles.main}>
      <div className={styles.top}>
        <div className={`skeleton ${skeletonStyles.titleSkeleton}`} />
        <div className={`skeleton ${skeletonStyles.countSkeleton}`} />
      </div>
      <div className={barStyles.bar}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`skeleton ${skeletonStyles.select}`} />
        ))}
      </div>
      <div className="title-grid">
        {Array.from({ length: 12 }).map((_, i) => (
          <TitleCardSkeleton key={i} />
        ))}
      </div>
    </main>
  );
}
