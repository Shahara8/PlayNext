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
- **Tech.** Next.js (App Router) with server-rendered pages and small client components. Styling is hand-written CSS modules, with **no design system or component library**. Colors are 4 CSS variables (background, foreground, muted foreground, border), and dark mode follows the device setting. The font is Arial/Helvetica. Posters and metadata come from TMDB.
- **Accounts.** Browsing and search work signed out. Saving anything (favorite, watchlist, like/dislike, rating) needs an account: email and password, or Google. Signed out, every save control sends you to the sign-in page.
- **Recommendations** ("For You") are basic: titles similar to what you liked, favorited, or rated 7+, then topped up with trending titles. With the tiny catalog, the list is often mostly trending.
- **Screenshots.** Taken from the live site (production) in headless Chrome, full page (from top to bottom of the page, not just the first screen). Phone at 412 px wide, 2x pixel density; desktop at 1280 px. The signed-in views use a test account named "Test Bot", which has 1 title on its watchlist (The Witcher) and 1 favorite (Breaking Bad, also liked).

## Elements that recur on every view

- **Header.** "PlayNext" logo (goes home) on the left; on the right: Browse (desktop only, since it duplicates the logo link), Search, My List, and either "Sign in" or the user's name (first name on phones, in grey) plus "Sign out". It doesn't stick to the top while scrolling.
- **Footer.** "PlayNext", a Privacy link, and "Title data from TMDB" (required attribution).
- **Title card** (home, browse, My List). Poster, title, year and type ("Movie"/"TV Series"), then the **save controls**: ♡ favorite, + watchlist (✓ once saved), 👍 like, 👎 dislike, and a "Rate" select (1/10 to 10/10). The poster and name link to the title page. Saved states show as a filled, darker button (see views 18 to 21).
- **Grids.** 2 columns on phones, up to 7 on desktop.
- **Search result card.** A horizontal card: small poster, title, year, type, TMDB rating (★), and a pill per service the title is on (colored dot plus name).
- **Service colors.** Netflix red, Disney+ blue, Prime Video cyan, yes amber, Partner TV green. They're used on the home page's service tiles (left border) and in the dots on search results and the title page.

## Not shown in screenshots (described only)

- **Loading skeletons.** Grey pulsing placeholders shaped like the page (poster boxes and lines) show while browse, search, My List, a title page and the For You section load. They're usually gone in well under a second.
- **Error page.** If a page fails to load: heading "Something went wrong", the line "We couldn't load this page. It's usually temporary.", a "Try again" button, a "Back to home" link and a small reference code. Same layout as the Not found page (view 16).
- **Save failure.** If saving a favorite, watchlist, like or rating fails, the control flips back and a small red "Couldn't save. Try again." appears under the controls.
- **For You failure.** If recommendations can't load, the section shows "Couldn't load recommendations right now." in place of the grid.
- **Form messages after submitting.** After sign-up: "Check your email to confirm your account before signing in." After a reset request: "If an account exists for that email, a link to reset your password is on its way." Validation errors (e.g. a short password) appear in red above the button, as in view 13.
- **My List signed out.** It redirects to the sign-in page (view 10).

---

## View 01: Home (signed out)

**Purpose.** The landing page: pick a streaming service to browse, or see what's trending.

**How users get here.** The site's address, the logo, or "Browse" in the header.

**What's on it.** The heading "PlayNext" and the line "Pick a streaming service to browse what's on it."; five service tiles (colored left border), 2 per row on phones and 5 in a row on desktop; then a **Trending** section: the line "Sign in and like a few titles to get personal picks" and 12 title cards.

**Known constraints.** The tiles are text only (no logos: we have no rights to use the services' logos). On phones the page is long: 12 cards in 2 columns, each with two rows of controls. There's no search box on the home page; search is its own page.

![Phone](images/01-home-phone.png) ![Desktop](images/01-home-desktop.png)

## View 02: Browse a service

**Purpose.** Everything on one service, to scan and pick from.

**How users get here.** A service tile on the home page. The URL is `/browse/netflix`, `/browse/yes`, etc.

**What's on it.** The service's name as the heading, a bar of four selects (Sort: Trending, Newest, Rating, A–Z; Type: All, Movies, TV Series; Availability: All, Subscription, Rent, Buy, Free; Genre: built from the service's titles), then the grid of title cards. Changing a select reloads the list and updates the URL, so a filtered list can be shared.

**Known constraints.** There's no pagination yet. With the real feed, a service could have hundreds or thousands of titles, so the grid will need paging or infinite scroll. The selects are native browser selects.

![Phone](images/02-browse-phone.png) ![Desktop](images/02-browse-desktop.png)

## View 03: Browse, sorted and filtered

**Purpose.** The same page with Sort set to Rating and Type set to TV Series, to show the filter bar in use.

**How users get here.** Changing the selects on view 02.

**What's on it.** As view 02, with the chosen values shown in the selects. There's no "clear filters" control while results exist, and no count of results.

![Phone](images/03-browse-sorted-filtered-phone.png) ![Desktop](images/03-browse-sorted-filtered-desktop.png)

## View 04: Browse, nothing matches the filters

**Purpose.** The empty state when the filters exclude everything (here: Availability is Free on Netflix).

**What's on it.** The filter bar, then "Nothing matches these filters. Clear filters" (the link keeps the sort and drops the filters). A service with no titles at all says "Nothing available on <service> yet." instead.

![Phone](images/04-browse-no-matches-phone.png) ![Desktop](images/04-browse-no-matches-desktop.png)

## View 05: Search, before typing

**Purpose.** Find a specific title across all services: the main "where can I watch X?" job.

**How users get here.** "Search" in the header. The box has focus right away.

**What's on it.** The heading "Search", the search box ("Search for a movie or show…") and the line "Start typing to search the catalog."

**Known constraints.** Results update as you type (after a short pause); there's no submit button. Search is typo-tolerant. No suggestions or recent searches.

![Phone](images/05-search-start-phone.png) ![Desktop](images/05-search-start-desktop.png)

## View 06: Search results

**Purpose.** The answer to "where can I watch X": each result lists the services it's on.

**What's on it.** The query "strnger" (a deliberate typo) finds Stranger Things. Each result is a horizontal card: small poster, title, year, type, TMDB rating, and a pill per service. The whole card links to the title page. A title that's on no tracked service says "Not currently available on any tracked provider".

**Known constraints.** Search results have no save controls (unlike cards elsewhere). The service pills aren't links.

![Phone](images/06-search-results-phone.png) ![Desktop](images/06-search-results-desktop.png)

## View 07: Search, no results


**What's on it.** "No results for “qwzxv”. Check the spelling, try fewer words, or browse by service." ("browse by service" goes home).

![Phone](images/07-search-no-results-phone.png) ![Desktop](images/07-search-no-results-desktop.png)

## View 08: Title page, with a watch link (signed out)

**Purpose.** Everything about one title, and above all **where to watch it**.

**How users get here.** Any title card or search result; also shared links. The URL is `/title/tv/1396`.

**What's on it.** Poster (above the text on phones, beside it on desktop), title, year, type, TMDB rating, the save controls plus a **Share** button (the phone's share sheet, or copy link), genre pills, the plot summary, then **Where to watch**: one row per service with a colored dot, the service name, the kind of availability (Subscription, Rent, Buy, Free) and a "Watch →" link that opens the service's page for the title in a new tab.

**Known constraints.** "Where to watch" is at the bottom: on phones it's below the fold, under the poster, controls and summary. With real data it will often list several services. There's no trailer, cast, or season information.

![Phone](images/08-title-with-watch-link-phone.png) ![Desktop](images/08-title-with-watch-link-desktop.png)

## View 09: Title page, without a watch link

**Purpose.** The same page for a title whose service gave us no link (all Partner TV titles today).

**What's on it.** The "Where to watch" row shows the service and the availability type, with nothing on the right. It doesn't explain how to find the title on that service.

![Phone](images/09-title-without-watch-link-phone.png) ![Desktop](images/09-title-without-watch-link-desktop.png)

## View 10: Sign in

**Purpose.** Sign in to save titles and get personal picks.

**How users get here.** "Sign in" in the header, the "Sign in" link on the home page, any save control while signed out, or My List while signed out.

**What's on it.** The heading "Sign in", tabs "Sign in" and "Sign up", Email and Password fields, a "Sign in" button, a "Forgot password?" link-button, an "or" divider and "Continue with Google". The form is a narrow centered column on desktop.

**Known constraints.** After signing in you always land on the home page, not on the page you came from.

![Phone](images/10-login-phone.png) ![Desktop](images/10-login-desktop.png)

## View 11: Sign up


**What's on it.** The same page with the "Sign up" tab selected: the button reads "Create account". The page heading still says "Sign in". After submitting, the user must confirm by email (see "Form messages" above).

![Phone](images/11-login-sign-up-phone.png) ![Desktop](images/11-login-sign-up-desktop.png)

## View 12: Forgot password (request a reset link)


**What's on it.** Reached from "Forgot password?" on view 10. The password field is replaced by "Enter your account's email and we'll send you a link to set a new password.", the button reads "Send reset link", and "Back to sign in" returns to view 10. Both tabs show as unselected.

![Phone](images/12-login-forgot-password-phone.png) ![Desktop](images/12-login-forgot-password-desktop.png)

## View 13: Sign in, with an error


**What's on it.** What users see when a Google sign-in or an email confirmation link fails: the sign-in form with a red message above the button ("Something went wrong signing you in — please try again."). Wrong-password and validation errors use the same red line.

![Phone](images/13-login-link-error-phone.png) ![Desktop](images/13-login-link-error-desktop.png)

## View 14: Set a new password, without a valid link

**Purpose.** The page the reset email links to. Without a fresh link (opened directly, or a used or expired link) it explains what to do.

**What's on it.** The heading "Set a new password" and "To set a new password, open the link in your reset email (links work once, for an hour). Request a new one if yours is missing or expired."

![Phone](images/14-reset-password-no-link-phone.png) ![Desktop](images/14-reset-password-no-link-desktop.png)

## View 15: Privacy policy

**Purpose.** Required for Google sign-in; linked from the footer.

**What's on it.** Plain text sections: What we store, How we use it, Who else handles it, Cookies, Your choices, Contact.

![Phone](images/15-privacy-phone.png) ![Desktop](images/15-privacy-desktop.png)

## View 16: Not found

**Purpose.** Unknown addresses, unknown services, and titles no longer on any tracked service (e.g. an old shared link).

**What's on it.** "Not found", "That page doesn't exist, or the title is no longer available on any service we track.", and two links: "Back to home" and "Search the catalog". The error page (described above) uses the same layout.

![Phone](images/16-not-found-phone.png) ![Desktop](images/16-not-found-desktop.png)

## View 17: Home (signed in)

**Purpose.** As view 01, but the second section is **For You** (personal picks).

**What's on it.** The header shows the user's name and "Sign out". The For You caption explains what the list is based on. For this test account it reads "Nothing like your picks is in our catalog yet, so here's what's trending." (the tiny mock catalog has nothing similar to its likes). Other captions: "Based on what you've liked.", "Based on what you've liked, plus trending titles." and, with no likes yet, "Like, favorite, or rate titles 7+ to personalize this. Trending picks for now." Titles the user already saved or rated are left out.

![Phone](images/17-home-signed-in-phone.png) ![Desktop](images/17-home-signed-in-desktop.png)

## View 18: Browse (signed in)


**What's on it.** As view 02, with the user's saved states on the cards: Breaking Bad shows a filled ♥ and a highlighted 👍, and The Witcher shows ✓ (on the watchlist).

![Phone](images/18-browse-signed-in-phone.png) ![Desktop](images/18-browse-signed-in-desktop.png)

## View 19: Title page (signed in)


**What's on it.** As view 08, with this account's state: favorited (♥) and liked (👍). Pressed controls are a darker grey fill with a darker border.

![Phone](images/19-title-signed-in-phone.png) ![Desktop](images/19-title-signed-in-desktop.png)

## View 20: My List, Watchlist tab

**Purpose.** The titles the user saved to watch later.

**How users get here.** "My List" in the header. Watchlist is the default tab.

**What's on it.** The heading "My List", tabs "Watchlist" and "Favorites", and a grid of title cards (newest saved first). Tapping ✓ un-saves a title, and the list refreshes without it.

**Known constraints.** There's no "watched" state, sorting, or filtering here. A title can be on the watchlist and in favorites at once.

![Phone](images/20-my-list-watchlist-phone.png) ![Desktop](images/20-my-list-watchlist-desktop.png)

## View 21: My List, Favorites tab


**What's on it.** As view 20, listing favorites.

![Phone](images/21-my-list-favorites-phone.png) ![Desktop](images/21-my-list-favorites-desktop.png)

## View 22: My List, empty


**What's on it.** The empty watchlist: "Your watchlist is empty. Tap + on any title to save it for later. Find something to watch" (the link goes home). The empty Favorites tab is the same with "No favorites yet. Tap ♡ on any title to add it here."

**Known constraints.** This is what every new user sees first on My List.

![Phone](images/22-my-list-empty-phone.png) ![Desktop](images/22-my-list-empty-desktop.png)

## View 23: Set a new password (from a valid reset link)

**Purpose.** The form a valid reset email link opens.

**What's on it.** "Set a new password", "For <the account's email>" (shown here as a placeholder address), a "New password" field and "Save password". After saving, the user is signed in and sent home.

![Phone](images/23-reset-password-form-phone.png) ![Desktop](images/23-reset-password-form-desktop.png)

## View 24: Home in dark mode

**Purpose.** Dark mode follows the device's setting (there's no toggle). Shown for the home page; every page switches the same 4 colors.

![Phone](images/24-dark-home-phone.png) ![Desktop](images/24-dark-home-desktop.png)

## View 25: Title page in dark mode

![Phone](images/25-dark-title-phone.png) ![Desktop](images/25-dark-title-desktop.png)
