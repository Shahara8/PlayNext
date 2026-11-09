# PlayNext: UI direction and review request

## Purpose of the platform

**PlayNext answers two questions for viewers in Israel: "Where can I watch this?" and "What should I watch next?"** Israeli viewers' shows and movies are spread across several streaming services: global ones (Netflix, Disney+, Prime Video) and Israeli ones (yes, Partner TV). Finding out which service has a title means opening each app and searching. PlayNext puts every service's catalog in one place.

The jobs it does, most important first:

1. **Find a title and see where to watch it.** Someone heard about a show and wants to know which service has it, and whether it's included in a subscription or costs extra to rent or buy. This should take seconds, on a phone. The answer, "Where to watch" with a link straight to the title on that service, is the most important thing on the platform.
2. **Browse what's on a service.** "What's on yes right now?", sorted and filtered (movies or series, genre, newest, best rated).
3. **Decide what to watch tonight.** Trending titles, and personal picks ("For You") once you've liked or rated a few.
4. **Keep a list.** Save titles to a watchlist for later, mark favorites, like or dislike, and rate. That's what accounts are for, and it feeds the personal picks.

PlayNext doesn't stream anything itself: every path ends with the user leaving for the service's own app or site. It's a guide, so speed and clarity matter more than time spent on the site.

## Brief

**What we're asking for.** You're reviewing the user interface of PlayNext. Each view below has full-page screenshots at phone width (412 px, left) and desktop width (1280 px, right), plus a description: what the view is for, how users reach it, what's on it, and known constraints. The current UI is functional but plain: it was built for function first, with no designer and no design system. We want to choose a visual and interaction direction before polishing details.

**Part 1 (the main ask): two to three distinct UI directions, with mockups.** Each direction should be a different answer to the purpose above, not three color schemes on the same layout. For each one, give:

- **A name and a one-paragraph concept:** what it puts first and why that serves the jobs above. What feeling does it aim for?
- **Mockups of the key screens at phone width:** home, a service's browse page, search with results, and a title page with several services under "Where to watch". Add the title page at desktop width too. Use real-looking content (posters, titles like the ones in the screenshots) and readable text, not lorem ipsum.
- **The visual system in brief:** color palette (light and dark), typography, spacing and shape (corners, cards), and how the five services' brand colors are used.
- **What changes from today**, view by view in a few lines, and what stays.
- **Trade-offs:** what it's best at, what it gives up, and the rough effort to build on our stack (S/M/L, see below).

End Part 1 with your recommendation: which direction you'd pick for this audience and purpose, and why.

**Part 2: concrete suggestions for the current UI, view by view.** These are problems and fixes that apply whichever direction we choose (bugs, unclear copy, layout problems, accessibility). For each suggestion:

- **What:** the specific change (e.g. "make the whole card tappable and move the rating select into the title page only"), not a general principle.
- **Why:** the problem it fixes for a user, and what you saw in the screenshot that shows it.
- **Size:** S (CSS or copy, under an hour), M (one component restructured), or L (a new component or flow, or changes across many views).
- **Priority:** P1 (hurts using the app now), P2 (clear improvement), P3 (polish).

**Format for Part 2.** One heading per view, using the view numbers below (e.g. "View 08: Title page"), with that view's suggestions as a numbered list, most important first. Put suggestions that apply to many views (header, cards, buttons, typography, color, spacing) in a "Cross-cutting" section at the start. End with your overall **top 10**, ordered by value for effort. Skip views you have nothing useful to say about. If something looks like a bug rather than a design choice, say so.

**Limits for both parts.** Directions can rethink layout, navigation, hierarchy and visual style freely. They should not depend on new data or backend features (e.g. "only show my services" settings, notifications, trailers, cast, social). If a direction needs one, label it as an optional extra. They must also not use the streaming services' logos (we have no rights to them; names and brand colors are fine). Everything must be buildable with hand-written CSS on our current stack (see Tech below), and must work well on phones first.

---

## Product context and constraints

- **Who uses it.** Israeli viewers deciding what to watch tonight and where. **Phone first:** most visits are expected on phones; desktop must work well but is secondary.
- **Language.** The UI is English-only today, left-to-right. Hebrew and RTL are not built. Title names come from TMDB in English. You can note places where Hebrew would later strain the layout, but don't plan around it.
- **The catalog is small and partly mock.** About 32 titles across 5 services. Netflix, Disney+ and Prime Video titles are **made-up stand-in data** until a real feed arrives (phase 2), so each title currently appears on exactly one service. In the real data a title can be on several services, so the "Where to watch" list on the title page will often have 2 to 4 rows. yes and Partner TV are moving to real data first. Partner TV rows currently have **no watch link**.
- **Tech.** Next.js (App Router) with server-rendered pages and small client components. Styling is hand-written CSS modules, with **no component library**. Colors are theme tokens in `app/globals.css` (background, surfaces, borders, text, muted text, an indigo accent, rating, danger, success), defined for a light and a dark theme and checked against WCAG AA. Shared button, input/select, chip, card and segmented-control styles sit on those tokens. The theme follows the device by default; a footer setting (System · Light · Dark) overrides it. The font is Geist. Posters and metadata come from TMDB.
- **Accounts.** Browsing and search work signed out. Saving anything (favorite, watchlist, like/dislike, rating) needs an account: email and password, or Google. Signed out, every save control sends you to the sign-in page.
- **Recommendations** ("For You") are basic: titles similar to what you liked, favorited, or rated 7+, then topped up with trending titles. With the tiny catalog, the list is often mostly trending.
- **Screenshots.** Taken from the live site (production) in headless Chrome, full page (from top to bottom of the page, not just the first screen). Phone at 412 px wide, 2x pixel density; desktop at 1280 px. Each view is shown in the light theme (first row) and the dark theme (second row). The signed-in views use a test account named "Test Bot", which has 1 title on its watchlist (The Witcher) and 1 favorite (Breaking Bad, also liked).

## Elements that recur on every view

- **Header.** A white (dark: dark navy) bar with a bottom border; it doesn't stick to the top while scrolling. "PlayNext" logo (goes home) on the left; on the right: a magnifier icon button (goes to Search; screen readers hear "Search"), Browse (desktop only, since it duplicates the logo link), My List, and either a "Sign in" button in the accent color or the user's first name (muted) plus "Sign out". Every item is a 44 px tap target, with a light gray fill on hover.
- **Footer.** The same surface and a top border, matching the header. "PlayNext" (bold), a Privacy link, "Title data from TMDB" (required attribution; the links are underlined, muted, 44 px tall), and the theme setting: "Theme" with a System · Light · Dark segmented control (at the far end on desktop, on its own line on phones). The header and footer share a side padding (16 px on phones, 24 px wider); the pages don't all use it yet, so some phone pages are indented 8 px more than the header.
- **Title card** (home, browse, My List; rebuilt in UI step 3). The poster (2:3, rounded) with a **★ rating badge** (TMDB's score, in the rating color on a surface chip) at its top inline-end corner, the title (2 lines at most) and "year · type" ("2016 · TV Series"). The poster, title and meta are one link to the title page. Below them just two 36 px icon buttons: **♡ favorite** and **+ watchlist** (✓ once saved); like, dislike and rating are on the title page only. Saved states show as a button tinted with the accent color, with an accent border and an accent icon (see views 18 to 21). The buttons sit at the bottom of the card, so a row of cards keeps them in line when one title wraps to two lines. A title with no TMDB score (or a score of 0, meaning no votes) has no badge.
- **Grids.** 2 columns on phones, 3 on tablets (601–899 px), 5 from 900 px and 6 from 1180 px. The home, browse and My List pages use the `--gutter` side padding, so the grid lines up with the logo.
- **Search result card** (rebuilt in UI step 5). A horizontal card: the poster at the inline start; beside it the title (bold), "year · type · ★ rating" (the rating in the rating color), and one item per service, subscription and free first. A service with a link is a **service-colored button "Watch on Netflix →"** that opens the service in a new tab; one without a link is a pill with the service's dot, its name and the availability ("● Partner TV · Subscription"). The poster and the title each link to the title page; the card itself isn't a link, so nothing is nested (the poster link is skipped by the keyboard and screen readers, since the title link goes to the same place). A title on no tracked service says "Not currently available on any tracked provider".
- **Service colors.** Netflix red, Disney+ blue, Prime Video cyan, yes amber, Partner TV green. They're used on the home page's service tiles (a bar across the top and a dot), in the dots on the title page and on search result pills, and as the Watch buttons on the title page, the home page's Trending now card and search results.

## Not shown in screenshots (described only)

- **Loading skeletons.** Grey pulsing placeholders shaped like the page (poster boxes and lines) show while browse (the title, the count, the four selects and the grid), search (the field, the results line and result cards with a button), My List (the title, the control and the grid), a title page and the home page's Trending now card and For You section load. They're usually gone in well under a second.
- **Error page.** If a page fails to load: heading "Something went wrong", the line "We couldn't load this page. It's usually temporary.", a "Try again" button, a "Back to home" link and a small reference code. Same layout as the Not found page (view 16).
- **Save failure.** If saving a favorite, watchlist, like or rating fails, the control flips back and a small red "Couldn't save. Try again." appears under the controls.
- **For You failure.** If recommendations can't load, the section shows "Couldn't load recommendations right now." in place of the grid.
- **Form messages after submitting.** After sign-up: "Check your email to confirm your account before signing in." After a reset request: "If an account exists for that email, a link to reset your password is on its way." Validation errors (e.g. a short password) appear in red above the button, as in view 13.
- **My List signed out.** It redirects to the sign-in page (view 10).

---

## View 01: Home (signed out)

**Purpose.** The landing page: search for a title to see where it's streaming, browse a service, or see what's trending.

**How users get here.** The site's address, the logo, or "Browse" in the header.

**What's on it** (rebuilt in UI step 4), top to bottom:
1. The heading **"Where can I watch…"**, the line "Find which services have a movie or show.", and a large search field (placeholder "e.g. Stranger Things") with a primary **Search** button. It's a plain form, so pressing Enter or Search opens the search page with the results (works before the page's scripts load).
2. **Browse by service:** a tile per service, each with a thin bar in the service's color across its top, a colored dot and the name, the number of titles ("8 titles"; "No titles yet" for none), and its two most popular titles in muted text (cut with "…" when long). The whole tile links to that service's browse page. On phones the tiles sit in one row that scrolls sideways (about two and a half visible, so the next one peeks in), running to the screen's edges; from 761 px all five sit in one row.
3. **Trending now:** the single most popular title as a wide card: poster, title (links to the title page), "year · type · ★ rating", the overview (3 lines at most), then a divider and its **Where to watch** rows (the title page's component, with Watch buttons in the service's color, or "No direct link yet"). Phones: the poster sits beside the title block, Where to watch is full width below. Desktop: the poster in its own column, everything else beside it. Today's top title, Project Hail Mary, is on Partner TV without a direct link, so the screenshots show "No direct link yet".
4. **Trending:** the line "Sign in and like a few titles to get personal picks" and 12 title cards. The featured title is left out, so it isn't shown twice.

**Known constraints.** The tiles are text only (no logos: we have no rights to use the services' logos). "Trending" is TMDB's worldwide popularity, not Israel's. On phones the page is long: 12 cards in 2 columns. While the tiles, the featured card and the grid load, the tiles show just the names (already linking) and the other two show skeletons; if the counts can't be read, the tiles stay names only, and if the featured title can't be read, its section is left out.

![Phone, light](images/01-home-phone-light.png) ![Desktop, light](images/01-home-desktop-light.png)

![Phone, dark](images/01-home-phone-dark.png) ![Desktop, dark](images/01-home-desktop-dark.png)

## View 02: Browse a service

**Purpose.** Everything on one service, to scan and pick from.

**How users get here.** A service tile on the home page. The URL is `/browse/netflix`, `/browse/yes`, etc.

**What's on it.** A header block: the service's colored dot and name as the page heading, and under it the number of titles in muted text ("8 titles"; the same count as the service's home tile). Then four labelled selects (Sort: Trending, Newest, Rating, A–Z; Type: All, Movies, TV Series; Availability: All, Subscription, Rent, Buy, Free; Genre: All plus the service's genres), in a 2×2 grid on phones and one row from 601 px. Then the grid of title cards. Changing a select reloads the list and updates the URL, so a filtered list can be shared. Sorting alone isn't filtering: the count stays "8 titles" and there's no Clear filters.

**Known constraints.** There's no pagination yet. With the real feed, a service could have hundreds or thousands of titles, so the grid will need paging or infinite scroll (the count is exact, but the grid would stop at the database's 1,000-row response cap). The selects are native browser selects.

![Phone, light](images/02-browse-phone-light.png) ![Desktop, light](images/02-browse-desktop-light.png)

![Phone, dark](images/02-browse-phone-dark.png) ![Desktop, dark](images/02-browse-desktop-dark.png)

## View 03: Browse, sorted and filtered

**Purpose.** The same page with Sort set to Rating and Type set to TV Series, to show the filter bar in use.

**How users get here.** Changing the selects on view 02.

**What's on it.** As view 02, with the chosen values shown in the selects. The count line reads "6 of 8 titles · Clear filters": how many match out of the service's whole catalog, and a link that drops the filters but keeps the sort (here it goes to `/browse/netflix?sort=rating`).

![Phone, light](images/03-browse-sorted-filtered-phone-light.png) ![Desktop, light](images/03-browse-sorted-filtered-desktop-light.png)

![Phone, dark](images/03-browse-sorted-filtered-phone-dark.png) ![Desktop, dark](images/03-browse-sorted-filtered-desktop-dark.png)

## View 04: Browse, nothing matches the filters

**Purpose.** The empty state when the filters exclude everything (here: Availability is Free on Netflix).

**What's on it.** The header block says "0 of 8 titles" (no link there), then the selects, then a panel: "Nothing matches these filters. Clear filters" (the link keeps the sort and drops the filters). A service with no titles at all says "No titles yet" in the header and "Nothing available on <service> yet." in the panel instead.

![Phone, light](images/04-browse-no-matches-phone-light.png) ![Desktop, light](images/04-browse-no-matches-desktop-light.png)

![Phone, dark](images/04-browse-no-matches-phone-dark.png) ![Desktop, dark](images/04-browse-no-matches-desktop-dark.png)

## View 05: Search, before typing

**Purpose.** Find a specific title across all services: the main "where can I watch X?" job.

**How users get here.** The search icon in the header, or the home page's search (which lands on view 06 with the query filled in). On an empty page the field has focus right away; with a query it doesn't, so a phone keyboard doesn't cover the results.

**What's on it.** The heading "Search", then the same large field and primary **Search** button as the home page (placeholder "e.g. Stranger Things"), and the line "Start typing to search the catalog." The content lines up with the header's logo.

**Known constraints.** Results update as you type, after a short pause, and the address follows (`/search?q=…`). Enter or the Search button searches at once (and closes a phone's keyboard); before the page's scripts load, it's a plain form. Search is typo-tolerant. No suggestions or recent searches.

![Phone, light](images/05-search-start-phone-light.png) ![Desktop, light](images/05-search-start-desktop-light.png)

![Phone, dark](images/05-search-start-phone-dark.png) ![Desktop, dark](images/05-search-start-desktop-dark.png)

## View 06: Search results

**Purpose.** The answer to "where can I watch X": each result lists the services it's on.

**What's on it.** The query "strnger" (a deliberate typo) finds Stranger Things. Above the results, the line "1 result for “strnger”", followed by a muted **"Showing closest matches"** because no result's title contains what was typed (a typo match). At the result limit (20) the line says "Top 20 results for …". Each result is a search result card (see "Shared pieces"): Stranger Things has a red **"Watch on Netflix →"** button. One column on phones, two from 900 px.

**Known constraints.** Search results have no save controls (unlike cards elsewhere). The Watch button doesn't say whether the title is included or rented (screen readers hear it: "Watch on Netflix, Subscription"); the title page shows it. Titles available on several services aren't in today's catalog, so a card with several buttons and pills isn't in the screenshots (checked by hand: they wrap).

![Phone, light](images/06-search-results-phone-light.png) ![Desktop, light](images/06-search-results-desktop-light.png)

![Phone, dark](images/06-search-results-phone-dark.png) ![Desktop, dark](images/06-search-results-desktop-dark.png)

## View 07: Search, no results


**What's on it.** The field (with "qwzxv"), then a panel: "No results for “qwzxv”." in bold, and "Check the spelling, try fewer words, or browse by service." ("browse by service" is a link to the home page).

![Phone, light](images/07-search-no-results-phone-light.png) ![Desktop, light](images/07-search-no-results-desktop-light.png)

![Phone, dark](images/07-search-no-results-phone-dark.png) ![Desktop, dark](images/07-search-no-results-desktop-dark.png)

## View 08: Title page, with a watch link (signed out)

**Purpose.** Everything about one title, and above all **where to watch it**.

**How users get here.** Any title card or search result; also shared links. The URL is `/title/tv/1396`.

**What's on it.** Rebuilt in UI step 2 (Where to watch first). On phones a compact top block: the poster (120 px) at the inline start and, beside it, the title, "year · type · ★ rating" (the rating in the rating color), genre chips and a **Share** button (icon plus text: the phone's share sheet, or copy link). Below it, at full width:
1. **Where to watch**, a card: one row per service with a colored dot, the service name, the availability ("Subscription" and "Free" in green, "Rent" and "Buy" muted) and, at the inline end, a **"Watch →" button in the service's color** that opens the service's page in a new tab. Subscription and free rows come first, then rent and buy (`lib/availability.ts`). On desktop, with 3 or more services the rows become tiles side by side.
2. The **save controls** as labeled buttons: "♡ Favorite", "+ Watchlist" ("✓ On watchlist" once saved), 👍, 👎 and a "Rate" select. On phones Favorite and Watchlist share the first row, and like, dislike and Rate the second. Pressed ones are accent-tinted with an accent border.
3. The plot summary (at most ~70 characters a line).

On desktop there are two columns: the poster (260 px, lined up with the header's logo) and, beside it, the same blocks in the same order. There's no breadcrumb.

**Known constraints.** With today's data every title is on one service, so the card has one row; the multi-service order and the desktop tiles were checked with rows added in the browser. There's no trailer, cast, or season information.

![Phone, light](images/08-title-with-watch-link-phone-light.png) ![Desktop, light](images/08-title-with-watch-link-desktop-light.png)

![Phone, dark](images/08-title-with-watch-link-phone-dark.png) ![Desktop, dark](images/08-title-with-watch-link-desktop-dark.png)

## View 09: Title page, without a watch link

**Purpose.** The same page for a title whose service gave us no link (all Partner TV titles today).

**What's on it.** As view 08, but the "Where to watch" row shows muted text "No direct link yet" where the Watch button would be (as tall as a button, so rows line up). It doesn't explain how to find the title on that service.

![Phone, light](images/09-title-without-watch-link-phone-light.png) ![Desktop, light](images/09-title-without-watch-link-desktop-light.png)

![Phone, dark](images/09-title-without-watch-link-phone-dark.png) ![Desktop, dark](images/09-title-without-watch-link-desktop-dark.png)

## View 10: Sign in

**Purpose.** Sign in to save titles and get personal picks.

**How users get here.** "Sign in" in the header, the "Sign in" link on the home page, any save control while signed out, or My List while signed out.

**What's on it.** The heading "Sign in", tabs "Sign in" and "Sign up", Email and Password fields, a "Sign in" button, a "Forgot password?" link-button, an "or" divider and "Continue with Google". The form is a narrow centered column on desktop.

**Known constraints.** After signing in you always land on the home page, not on the page you came from.

![Phone, light](images/10-login-phone-light.png) ![Desktop, light](images/10-login-desktop-light.png)

![Phone, dark](images/10-login-phone-dark.png) ![Desktop, dark](images/10-login-desktop-dark.png)

## View 11: Sign up


**What's on it.** The same page with the "Sign up" tab selected: the button reads "Create account". The page heading still says "Sign in". After submitting, the user must confirm by email (see "Form messages" above).

![Phone, light](images/11-login-sign-up-phone-light.png) ![Desktop, light](images/11-login-sign-up-desktop-light.png)

![Phone, dark](images/11-login-sign-up-phone-dark.png) ![Desktop, dark](images/11-login-sign-up-desktop-dark.png)

## View 12: Forgot password (request a reset link)


**What's on it.** Reached from "Forgot password?" on view 10. The password field is replaced by "Enter your account's email and we'll send you a link to set a new password.", the button reads "Send reset link", and "Back to sign in" returns to view 10. Both tabs show as unselected.

![Phone, light](images/12-login-forgot-password-phone-light.png) ![Desktop, light](images/12-login-forgot-password-desktop-light.png)

![Phone, dark](images/12-login-forgot-password-phone-dark.png) ![Desktop, dark](images/12-login-forgot-password-desktop-dark.png)

## View 13: Sign in, with an error


**What's on it.** What users see when a Google sign-in or an email confirmation link fails: the sign-in form with a red message above the button ("Something went wrong signing you in — please try again."). Wrong-password and validation errors use the same red line.

![Phone, light](images/13-login-link-error-phone-light.png) ![Desktop, light](images/13-login-link-error-desktop-light.png)

![Phone, dark](images/13-login-link-error-phone-dark.png) ![Desktop, dark](images/13-login-link-error-desktop-dark.png)

## View 14: Set a new password, without a valid link

**Purpose.** The page the reset email links to. Without a fresh link (opened directly, or a used or expired link) it explains what to do.

**What's on it.** The heading "Set a new password" and "To set a new password, open the link in your reset email (links work once, for an hour). Request a new one if yours is missing or expired."

![Phone, light](images/14-reset-password-no-link-phone-light.png) ![Desktop, light](images/14-reset-password-no-link-desktop-light.png)

![Phone, dark](images/14-reset-password-no-link-phone-dark.png) ![Desktop, dark](images/14-reset-password-no-link-desktop-dark.png)

## View 15: Privacy policy

**Purpose.** Required for Google sign-in; linked from the footer.

**What's on it.** Plain text sections: What we store, How we use it, Who else handles it, Cookies, Your choices, Contact.

![Phone, light](images/15-privacy-phone-light.png) ![Desktop, light](images/15-privacy-desktop-light.png)

![Phone, dark](images/15-privacy-phone-dark.png) ![Desktop, dark](images/15-privacy-desktop-dark.png)

## View 16: Not found

**Purpose.** Unknown addresses, unknown services, and titles no longer on any tracked service (e.g. an old shared link).

**What's on it.** "Not found", "That page doesn't exist, or the title is no longer available on any service we track.", and two links: "Back to home" and "Search the catalog". The error page (described above) uses the same layout.

![Phone, light](images/16-not-found-phone-light.png) ![Desktop, light](images/16-not-found-desktop-light.png)

![Phone, dark](images/16-not-found-phone-dark.png) ![Desktop, dark](images/16-not-found-desktop-dark.png)

## View 17: Home (signed in)

**Purpose.** As view 01, but the last section is **For You** (personal picks). The search, the service tiles and the Trending now card are the same as signed out; For You also leaves out the featured title.

**What's on it.** The header shows the user's first name and "Sign out". The For You caption explains what the list is based on. For this test account it reads "Nothing like your picks is in our catalog yet, so here's what's trending." (the tiny mock catalog has nothing similar to its likes). Other captions: "Based on what you've liked.", "Based on what you've liked, plus trending titles." and, with no likes yet, "Like, favorite, or rate titles 7+ to personalize this. Trending picks for now." Titles the user already saved or rated are left out.

![Phone, light](images/17-home-signed-in-phone-light.png) ![Desktop, light](images/17-home-signed-in-desktop-light.png)

![Phone, dark](images/17-home-signed-in-phone-dark.png) ![Desktop, dark](images/17-home-signed-in-desktop-dark.png)

## View 18: Browse (signed in)


**What's on it.** As view 02, with the user's saved states on the cards: Breaking Bad shows a filled ♥ (its like shows only on the title page), and The Witcher shows ✓ (on the watchlist).

![Phone, light](images/18-browse-signed-in-phone-light.png) ![Desktop, light](images/18-browse-signed-in-desktop-light.png)

![Phone, dark](images/18-browse-signed-in-phone-dark.png) ![Desktop, dark](images/18-browse-signed-in-desktop-dark.png)

## View 19: Title page (signed in)


**What's on it.** As view 08, with this account's state: favorited ("♥ Favorite") and liked (👍). Pressed buttons have an accent-tinted fill and an accent border.

![Phone, light](images/19-title-signed-in-phone-light.png) ![Desktop, light](images/19-title-signed-in-desktop-light.png)

![Phone, dark](images/19-title-signed-in-phone-dark.png) ![Desktop, dark](images/19-title-signed-in-desktop-dark.png)

## View 20: My List, Watchlist tab

**Purpose.** The titles the user saved to watch later.

**How users get here.** "My List" in the header. Watchlist is the default tab.

**What's on it.** The heading "My List" and a segmented control "Watchlist · Favorites" (two links; the current one is filled with the accent color). On phones the control sits under the heading and spans the width in two equal halves; from 601 px it sits on the heading's row at the inline end. Below, the title card grid (newest saved first). Tapping ✓ un-saves a title, and the list refreshes without it. The page uses the header's width and `--gutter`.

**Known constraints.** There's no "watched" state, sorting, or filtering here. A title can be on the watchlist and in favorites at once.

![Phone, light](images/20-my-list-watchlist-phone-light.png) ![Desktop, light](images/20-my-list-watchlist-desktop-light.png)

![Phone, dark](images/20-my-list-watchlist-phone-dark.png) ![Desktop, dark](images/20-my-list-watchlist-desktop-dark.png)

## View 21: My List, Favorites tab


**What's on it.** As view 20, listing favorites.

![Phone, light](images/21-my-list-favorites-phone-light.png) ![Desktop, light](images/21-my-list-favorites-desktop-light.png)

![Phone, dark](images/21-my-list-favorites-phone-dark.png) ![Desktop, dark](images/21-my-list-favorites-desktop-dark.png)

## View 22: My List, empty


**What's on it.** The heading and segmented control as in view 20, then a centered panel (a card, at most 32rem wide) instead of the grid: a bold line "Your watchlist is empty", a muted hint "Tap + on any title to save it for later.", and a primary button "Find something to watch" that goes home. The empty Favorites tab is the same with "No favorites yet" and "Tap ♡ on any title to add it here." (not in the screenshots: the test account has a favorite).

**Known constraints.** This is what every new user sees first on My List.

![Phone, light](images/22-my-list-empty-phone-light.png) ![Desktop, light](images/22-my-list-empty-desktop-light.png)

![Phone, dark](images/22-my-list-empty-phone-dark.png) ![Desktop, dark](images/22-my-list-empty-desktop-dark.png)

## View 23: Set a new password (from a valid reset link)

**Purpose.** The form a valid reset email link opens.

**What's on it.** "Set a new password", "For <the account's email>" (shown here as a placeholder address), a "New password" field and "Save password". After saving, the user is signed in and sent home.

![Phone, light](images/23-reset-password-form-phone-light.png) ![Desktop, light](images/23-reset-password-form-desktop-light.png)

![Phone, dark](images/23-reset-password-form-phone-dark.png) ![Desktop, dark](images/23-reset-password-form-desktop-dark.png)
