import { TitleCardSkeleton } from "@/app/components/title-card";
import styles from "./page.module.css";
import skeletonStyles from "./loading.module.css";

export default function MyListLoading() {
  return (
    <main className={styles.main}>
      <div className={styles.top}>
        <div className={`skeleton ${skeletonStyles.titleSkeleton}`} />
        <div className={`skeleton ${skeletonStyles.tabsSkeleton}`} />
      </div>
      <div className="title-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <TitleCardSkeleton key={i} />
        ))}
      </div>
    </main>
  );
}
