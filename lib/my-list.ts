import { firstSearchParam } from "./query-params";

/** The two My List tabs (`/my-list` and `/my-list?view=favorites`). */
export type MyListView = "watchlist" | "favorites";

/** The tab a `view` query value asks for; anything but "favorites" is the
 * watchlist, so a stray or repeated param never breaks the page. */
export function parseMyListView(
  raw: string | string[] | undefined,
): MyListView {
  return firstSearchParam(raw) === "favorites" ? "favorites" : "watchlist";
}

/** Each tab's link, in the order the segmented control shows them. */
export const MY_LIST_TABS: readonly {
  view: MyListView;
  label: string;
  href: string;
}[] = [
  { view: "watchlist", label: "Watchlist", href: "/my-list" },
  { view: "favorites", label: "Favorites", href: "/my-list?view=favorites" },
];

/** The empty-state panel's copy: a short line, then how to fill the tab. */
export function myListEmptyCopy(view: MyListView): {
  line: string;
  hint: string;
} {
  return view === "favorites"
    ? {
        line: "No favorites yet",
        hint: "Tap ♡ on any title to add it here.",
      }
    : {
        line: "Your watchlist is empty",
        hint: "Tap + on any title to save it for later.",
      };
}
