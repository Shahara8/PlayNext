import { describe, expect, it } from "vitest";
import { MY_LIST_TABS, myListEmptyCopy, parseMyListView } from "./my-list";

describe("parseMyListView", () => {
  it("defaults to the watchlist", () => {
    expect(parseMyListView(undefined)).toBe("watchlist");
    expect(parseMyListView("")).toBe("watchlist");
  });

  it("reads favorites", () => {
    expect(parseMyListView("favorites")).toBe("favorites");
  });

  it("treats anything else as the watchlist", () => {
    expect(parseMyListView("watchlist")).toBe("watchlist");
    expect(parseMyListView("Favorites")).toBe("watchlist");
    expect(parseMyListView("ratings")).toBe("watchlist");
  });

  it("uses the first value when the param repeats", () => {
    expect(parseMyListView(["favorites", "watchlist"])).toBe("favorites");
    expect(parseMyListView(["watchlist", "favorites"])).toBe("watchlist");
  });
});

describe("MY_LIST_TABS", () => {
  it("is Watchlist then Favorites, each linking to its own view", () => {
    expect(MY_LIST_TABS.map((t) => t.label)).toEqual([
      "Watchlist",
      "Favorites",
    ]);
    for (const tab of MY_LIST_TABS) {
      const query = new URL(tab.href, "https://x.test").searchParams;
      expect(parseMyListView(query.get("view") ?? undefined)).toBe(tab.view);
    }
  });
});

describe("myListEmptyCopy", () => {
  it("has the watchlist's line and hint", () => {
    expect(myListEmptyCopy("watchlist")).toEqual({
      line: "Your watchlist is empty",
      hint: "Tap + on any title to save it for later.",
    });
  });

  it("has the favorites' line and hint", () => {
    expect(myListEmptyCopy("favorites")).toEqual({
      line: "No favorites yet",
      hint: "Tap ♡ on any title to add it here.",
    });
  });
});
