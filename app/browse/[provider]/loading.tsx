import { TitleCardSkeleton } from "@/app/components/title-card";
import styles from "./page.module.css";
import skeletonStyles from "./loading.module.css";

export default function BrowseLoading() {
  return (
    <main className={styles.main}>
      <div className={`skeleton ${skeletonStyles.titleSkeleton}`} />
      <div className={`skeleton ${skeletonStyles.barSkeleton}`} />
      <div className="title-grid">
        {Array.from({ length: 12 }).map((_, i) => (
          <TitleCardSkeleton key={i} />
        ))}
      </div>
    </main>
  );
}
