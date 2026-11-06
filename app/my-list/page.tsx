import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createServerSupabaseClient,
  getCurrentUser,
} from "@/lib/supabase-server";
import { firstSearchParam } from "@/lib/query-params";
import { getFavoriteTitles, getWatchlistTitles } from "@/lib/user-titles";
import { getViewerTitleStates } from "@/lib/viewer-titles";
import { titleKey } from "@/lib/title-ref";
import TitleCard from "@/app/components/title-card";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "My List",
  robots: { index: false },
};

export default async function MyListPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const view =
    firstSearchParam(sp.view) === "favorites" ? "favorites" : "watchlist";

  const supabase = await createServerSupabaseClient();
  const titles =
    view === "favorites"
      ? await getFavoriteTitles(supabase, user.id)
      : await getWatchlistTitles(supabase, user.id);
  const { states, unavailable } = await getViewerTitleStates(titles);

  return (
    <main className={styles.main}>
      <h1>My List</h1>
      <nav className={styles.tabs}>
        <Link
          href="/my-list"
          aria-current={view === "watchlist" ? "page" : undefined}
          className={view === "watchlist" ? styles.tabActive : styles.tab}
        >
          Watchlist
        </Link>
        <Link
          href="/my-list?view=favorites"
          aria-current={view === "favorites" ? "page" : undefined}
          className={view === "favorites" ? styles.tabActive : styles.tab}
        >
          Favorites
        </Link>
      </nav>
      {titles.length === 0 ? (
        <p className={styles.empty}>
          {view === "favorites"
            ? "No favorites yet. Tap ♡ on any title to add it here."
            : "Your watchlist is empty. Tap + on any title to save it for later."}{" "}
          <Link href="/" className={styles.emptyLink}>
            Find something to watch
          </Link>
        </p>
      ) : (
        <div className={styles.grid}>
          {titles.map((title) => (
            <TitleCard
              key={titleKey(title)}
              row={title}
              userId={user.id}
              state={states.get(titleKey(title))}
              stateUnavailable={unavailable}
            />
          ))}
        </div>
      )}
    </main>
  );
}
