import Link from "next/link";
import { connection } from "next/server";
import {
  getRecommendations,
  type Recommendations,
} from "@/lib/recommendations";
import {
  createServerSupabaseClient,
  getCurrentUser,
} from "@/lib/supabase-server";
import TitleCard from "./title-card";
import styles from "./for-you.module.css";

const HOME_LIMIT = 12;

// What a signed-in viewer's list is based on.
function caption({
  hasSeeds,
  seedLookupsFailed,
  titles,
}: Recommendations): string {
  if (!hasSeeds)
    return "Like, favorite, or rate titles 7+ to personalize this. Trending picks for now.";
  const picks = titles.filter((title) => title.source === "seeds").length;
  if (picks === 0 && seedLookupsFailed)
    return "Couldn't fetch personal picks right now, so here's what's trending.";
  if (picks === 0)
    return "Nothing like your picks is in our catalog yet, so here's what's trending.";
  return picks < titles.length
    ? "Based on what you've liked, plus trending titles."
    : "Based on what you've liked.";
}

// Calls the recommendations module directly rather than fetching
// /api/recommendations, which would only add an HTTP hop (and need the
// session cookie forwarded). Every title shown is one the viewer has no
// saved state for (getRecommendations excludes those), so no state read.
export default async function ForYou() {
  // Outside the try: during prerendering connection() rejects on purpose to
  // mark this section dynamic, and catching that would break it. The session
  // lookup is inside, so if it fails this section shows its error state
  // instead of taking down the home page.
  await connection();
  let user: Awaited<ReturnType<typeof getCurrentUser>> = null;
  let recommendations: Recommendations;
  try {
    user = await getCurrentUser();
    const viewer = user
      ? { supabase: await createServerSupabaseClient(), userId: user.id }
      : null;
    recommendations = await getRecommendations(viewer, HOME_LIMIT);
  } catch (error) {
    console.error(error);
    return (
      <section className={styles.section}>
        <h2>{user ? "For You" : "Trending"}</h2>
        <p className={styles.caption}>
          Couldn&apos;t load recommendations right now.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <h2>{user ? "For You" : "Trending"}</h2>
      {user ? (
        <p className={styles.caption}>{caption(recommendations)}</p>
      ) : (
        <p className={styles.caption}>
          <Link href="/login" className={styles.link}>
            Sign in
          </Link>{" "}
          and like a few titles to get personal picks.
        </p>
      )}
      {recommendations.titles.length === 0 ? (
        <p className={styles.caption}>Nothing to recommend right now.</p>
      ) : (
        <div className={styles.grid}>
          {recommendations.titles.map((title) => (
            <TitleCard
              key={title.tmdb_id}
              row={title}
              userId={user?.id ?? null}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function ForYouSkeleton() {
  return (
    <section className={styles.section}>
      <div className={`skeleton ${styles.headingSkeleton}`} />
      <div className={styles.grid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={styles.cardSkeleton}>
            <div className={`skeleton ${styles.posterSkeleton}`} />
            <div className={`skeleton ${styles.lineSkeleton}`} />
          </div>
        ))}
      </div>
    </section>
  );
}
