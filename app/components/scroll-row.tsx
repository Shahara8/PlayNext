"use client";

import type { ReactNode } from "react";

/**
 * A list that scrolls sideways (the home page's service tiles on phones).
 * Chrome doesn't scroll a partly visible element into view when it gets
 * keyboard focus, so a tile at the screen's edge stayed cut off, focus ring
 * and all. This scrolls the focused item fully into view (and no further:
 * "nearest"), for keyboard focus only: a mouse press also focuses a link,
 * and moving the row under the pointer before the release would lose the
 * click.
 */
export function ScrollRow({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <ul
      className={className}
      onFocus={(event) => {
        if (event.target.matches(":focus-visible"))
          event.target.scrollIntoView({ block: "nearest", inline: "nearest" });
      }}
    >
      {children}
    </ul>
  );
}
