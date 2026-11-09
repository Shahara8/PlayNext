import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createServerSupabaseClient,
  getCurrentUser,
} from "@/lib/supabase-server";
import { MY_LIST_TABS, myListEmptyCopy, parseMyListView } from "@/lib/my-list";
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
  const view = parseMyListView(sp.view);

  const supabase = await createServerSupabaseClient();
  const titles =
    view === "favorites"
      ? await getFavoriteTitles(supabase, user.id)
      : await getWatchlistTitles(supabase, user.id);
  const { states, unavailable } = await getViewerTitleStates(titles);

  const empty = myListEmptyCopy(view);

  return (
    <main className={styles.main}>
      <div className={styles.top}>
        <h1>My List</h1>
        <nav aria-label="My List" className={`segmented ${styles.tabs}`}>
          {MY_LIST_TABS.map((tab) => (
            <Link
              key={tab.view}
              href={tab.href}
              aria-current={view === tab.view ? "page" : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      {titles.length === 0 ? (
        <div className="card empty-state" data-empty-state>
          <h2>{empty.line}</h2>
          <p>{empty.hint}</p>
          <Link href="/" className="btn btn-primary">
            Find something to watch
          </Link>
        </div>
      ) : (
        <div className="title-grid">
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
