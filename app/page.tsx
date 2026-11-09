import { Suspense } from "react";
import HomeSearch from "./components/home-search";
import ProviderPicker, { ProviderTiles } from "./components/provider-picker";
import FeaturedTitle, {
  FeaturedTitleSkeleton,
} from "./components/featured-title";
import ForYou, { ForYouSkeleton } from "./components/for-you";
import styles from "./page.module.css";

// docs/UI_DIRECTION.md Section 4, Home: search first, then the services,
// the featured title and the grid.
export default function Home() {
  return (
    <main className={styles.main}>
      <div className={styles.hero}>
        <h1>Where can I watch…</h1>
        <p className={styles.lede}>Find which services have a movie or show.</p>
        <HomeSearch />
      </div>
      {/* Each reads the catalog (and ForYou the session) per request, so only
          these sections render per request; the search above stays in the
          prerendered shell. The tiles' fallback already links each service. */}
      <Suspense fallback={<ProviderTiles loading />}>
        <ProviderPicker />
      </Suspense>
      <Suspense fallback={<FeaturedTitleSkeleton />}>
        <FeaturedTitle />
      </Suspense>
      <Suspense fallback={<ForYouSkeleton />}>
        <ForYou />
      </Suspense>
    </main>
  );
}
