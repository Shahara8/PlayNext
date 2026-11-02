"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import {
  EMPTY_TITLE_STATE,
  nextSentiment,
  parseRating,
  RATING_VALUES,
  setFavorite,
  setInWatchlist,
  setRating,
  setSentiment,
  titleStateKey,
  type Sentiment,
  type TitleUserState,
} from "@/lib/user-titles";
import styles from "./title-actions.module.css";

export default function TitleActions({
  tmdbId,
  userId,
  initialState = EMPTY_TITLE_STATE,
  unavailable = false,
}: {
  tmdbId: number;
  userId: string | null;
  initialState?: TitleUserState;
  /** The viewer's saved state couldn't be loaded — render disabled, not empty. */
  unavailable?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  // Controls stay disabled during a write, so two quick clicks can't race and
  // land out of order.
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // Adopt fresh server state (a refresh after another tab's change, a new
  // tmdbId) when it changes — but not mid-write: a refresh triggered by an
  // earlier write can land then, carrying state that predates the current
  // one. The refresh this write triggers will carry the final state anyway.
  // Adjusting state during render (not an effect), per React's docs.
  const serverKey = titleStateKey(tmdbId, initialState);
  const [seenServerKey, setSeenServerKey] = useState(serverKey);
  if (serverKey !== seenServerKey) {
    setSeenServerKey(serverKey);
    if (!saving) setState(initialState);
  }

  const disabled = saving || unavailable;

  async function apply(
    next: TitleUserState,
    write: (supabase: SupabaseClient, userId: string) => Promise<void>,
  ) {
    if (!userId) {
      router.push("/login");
      return;
    }

    const previous = state;
    const keyAtStart = seenServerKey;
    setState(next);
    setSaving(true);
    setFailed(false);
    try {
      await write(createBrowserSupabaseClient(), userId);
      // Drops the router's cached pages, so My List and any other page already
      // visited show this change.
      router.refresh();
    } catch {
      setState(previous);
      // If fresh server state arrived mid-write (and was deferred above), it's
      // newer than `previous`: clear the seen key so the next render adopts it.
      setSeenServerKey((seen) => (seen === keyAtStart ? seen : ""));
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  function toggleFavorite() {
    const isFavorite = !state.isFavorite;
    apply({ ...state, isFavorite }, (supabase, id) =>
      setFavorite(supabase, id, tmdbId, isFavorite),
    );
  }

  function toggleWatchlist() {
    const inWatchlist = !state.inWatchlist;
    apply({ ...state, inWatchlist }, (supabase, id) =>
      setInWatchlist(supabase, id, tmdbId, inWatchlist),
    );
  }

  function toggleSentiment(clicked: Sentiment) {
    const sentiment = nextSentiment(state.sentiment, clicked);
    apply({ ...state, sentiment }, (supabase, id) =>
      setSentiment(supabase, id, tmdbId, sentiment),
    );
  }

  function changeRating(value: string) {
    const rating = parseRating(value);
    apply({ ...state, rating }, (supabase, id) =>
      setRating(supabase, id, tmdbId, rating),
    );
  }

  return (
    <div
      className={styles.actions}
      title={unavailable ? "Couldn't load your saved state" : undefined}
    >
      <button
        type="button"
        className={styles.button}
        aria-label="Favorite"
        aria-pressed={state.isFavorite}
        title="Favorite"
        disabled={disabled}
        onClick={toggleFavorite}
      >
        {state.isFavorite ? "♥" : "♡"}
      </button>
      <button
        type="button"
        className={styles.button}
        aria-label="Watchlist"
        aria-pressed={state.inWatchlist}
        title="Watchlist"
        disabled={disabled}
        onClick={toggleWatchlist}
      >
        {state.inWatchlist ? "✓" : "+"}
      </button>
      <button
        type="button"
        className={styles.button}
        aria-label="Like"
        aria-pressed={state.sentiment === "like"}
        title="Like"
        disabled={disabled}
        onClick={() => toggleSentiment("like")}
      >
        👍
      </button>
      <button
        type="button"
        className={styles.button}
        aria-label="Dislike"
        aria-pressed={state.sentiment === "dislike"}
        title="Dislike"
        disabled={disabled}
        onClick={() => toggleSentiment("dislike")}
      >
        👎
      </button>
      <select
        className={styles.rating}
        aria-label="Your rating"
        value={state.rating ?? ""}
        disabled={disabled}
        // Signed out, the select has nothing to save: send them to sign in as
        // soon as they reach for it, same as the buttons.
        onMouseDown={(e) => {
          if (!userId) {
            e.preventDefault();
            router.push("/login");
          }
        }}
        onChange={(e) => changeRating(e.target.value)}
      >
        <option value="">Rate</option>
        {RATING_VALUES.map((value) => (
          <option key={value} value={value}>
            {value}/10
          </option>
        ))}
      </select>
      {failed && (
        <p role="alert" className={styles.error}>
          Couldn&apos;t save. Try again.
        </p>
      )}
    </div>
  );
}
