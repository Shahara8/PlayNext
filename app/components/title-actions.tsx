"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { TitleRef } from "@/lib/title-ref";
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
  titleRef,
  userId,
  initialState = EMPTY_TITLE_STATE,
  unavailable = false,
  labeled = false,
}: {
  /** Just the key (not a whole row), so the client props stay small. */
  titleRef: TitleRef;
  userId: string | null;
  initialState?: TitleUserState;
  /** The viewer's saved state couldn't be loaded — render disabled, not empty. */
  unavailable?: boolean;
  /** The title page's large buttons with text ("♡ Favorite"); cards stay
   * compact icons. Only markup and style differ, never behavior. */
  labeled?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  // Controls stay disabled during a write, so two quick clicks can't race and
  // land out of order.
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // Adopt fresh server state (a refresh after another tab's change, a new
  // title) when it changes — but not mid-write: a refresh triggered by an
  // earlier write can land then, carrying state that predates the current
  // one. The refresh this write triggers will carry the final state anyway.
  // Adjusting state during render (not an effect), per React's docs.
  const serverKey = titleStateKey(titleRef, initialState);
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
      setFavorite(supabase, id, titleRef, isFavorite),
    );
  }

  function toggleWatchlist() {
    const inWatchlist = !state.inWatchlist;
    apply({ ...state, inWatchlist }, (supabase, id) =>
      setInWatchlist(supabase, id, titleRef, inWatchlist),
    );
  }

  function toggleSentiment(clicked: Sentiment) {
    const sentiment = nextSentiment(state.sentiment, clicked);
    apply({ ...state, sentiment }, (supabase, id) =>
      setSentiment(supabase, id, titleRef, sentiment),
    );
  }

  function changeRating(value: string) {
    const rating = parseRating(value);
    apply({ ...state, rating }, (supabase, id) =>
      setRating(supabase, id, titleRef, rating),
    );
  }

  const buttonClass = labeled
    ? `btn btn-secondary ${styles.labeled}`
    : styles.button;
  // Compact buttons are icons, named by aria-label. Labeled ones are named by
  // their visible text (the icon is hidden), so the name always matches what's
  // on screen ("On watchlist" included). `data-action` is the stable hook for
  // scripts/smoke.ts and scripts/ui-capture.ts.
  const named = (name: string) =>
    labeled ? {} : { "aria-label": name, title: name };
  const icon = (glyph: string) =>
    labeled ? <span aria-hidden="true">{glyph}</span> : glyph;

  return (
    <div
      className={labeled ? `${styles.actions} ${styles.large}` : styles.actions}
      title={unavailable ? "Couldn't load your saved state" : undefined}
    >
      <button
        type="button"
        className={buttonClass}
        data-action="favorite"
        {...named("Favorite")}
        aria-pressed={state.isFavorite}
        disabled={disabled}
        onClick={toggleFavorite}
      >
        {icon(state.isFavorite ? "♥" : "♡")}
        {labeled && "Favorite"}
      </button>
      <button
        type="button"
        className={buttonClass}
        data-action="watchlist"
        {...named("Watchlist")}
        aria-pressed={state.inWatchlist}
        disabled={disabled}
        onClick={toggleWatchlist}
      >
        {icon(state.inWatchlist ? "✓" : "+")}
        {labeled && (state.inWatchlist ? "On watchlist" : "Watchlist")}
      </button>
      {/* Emoji only in both modes, so always named by aria-label. */}
      <button
        type="button"
        className={buttonClass}
        data-action="like"
        aria-label="Like"
        title="Like"
        aria-pressed={state.sentiment === "like"}
        disabled={disabled}
        onClick={() => toggleSentiment("like")}
      >
        👍
      </button>
      <button
        type="button"
        className={buttonClass}
        data-action="dislike"
        aria-label="Dislike"
        title="Dislike"
        aria-pressed={state.sentiment === "dislike"}
        disabled={disabled}
        onClick={() => toggleSentiment("dislike")}
      >
        👎
      </button>
      <select
        className={labeled ? `select ${styles.ratingLarge}` : styles.rating}
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
