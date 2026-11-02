import { Suspense } from "react";
import ProviderPicker from "./components/provider-picker";
import ForYou, { ForYouSkeleton } from "./components/for-you";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <h1>PlayNext</h1>
      <p>Pick a streaming service to browse what&apos;s on it.</p>
      <ProviderPicker />
      {/* Reads the session, so only this section renders per request; the
          rest of the page stays in the prerendered shell. */}
      <Suspense fallback={<ForYouSkeleton />}>
        <ForYou />
      </Suspense>
    </main>
  );
}
