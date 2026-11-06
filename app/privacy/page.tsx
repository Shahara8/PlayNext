import type { Metadata } from "next";
import Link from "next/link";
import { PRIVACY_METADATA, SITE_NAME, SUPPORT_EMAIL } from "@/lib/seo";
import styles from "./page.module.css";

// Linked from the site footer and from the Google OAuth consent screen
// (Branding → "Application privacy policy link"), which Google requires
// before the app can be published. Keep it factual: if what the app stores
// or who it shares data with changes, update this page in the same change.
export const metadata: Metadata = PRIVACY_METADATA;

const LAST_UPDATED = "6 November 2026";

export default function PrivacyPage() {
  const mail = <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;

  return (
    <main className={styles.main}>
      <h1>Privacy policy</h1>
      <p className={styles.updated}>Last updated: {LAST_UPDATED}</p>

      <p>
        {SITE_NAME} helps you find where to watch movies and shows on streaming
        services in Israel. You can browse and search without an account. This
        page explains what we keep if you create one, and why.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Your account:</strong> your email address and a securely
          hashed password. If you sign in with Google, we receive your name,
          email address and profile picture link from Google, and nothing else
          from your Google account.
        </li>
        <li>
          <strong>Your activity in {SITE_NAME}:</strong> the titles you add to
          your watchlist or favorites, your likes and dislikes, and your
          ratings, with the time you saved them.
        </li>
        <li>
          <strong>Technical logs:</strong> our hosting and sign-in providers
          keep standard logs, such as IP address, browser type and the time of a
          request, to run and secure the service.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To sign you in and keep you signed in.</li>
        <li>To show your watchlist, favorites and ratings back to you.</li>
        <li>
          To recommend titles based on the ones you liked or rated highly.
        </li>
        <li>
          To send emails you asked for, like confirming your account or
          resetting your password. We don&apos;t send marketing email.
        </li>
      </ul>
      <p>
        We don&apos;t sell your data, show ads, or use advertising or analytics
        trackers. Your lists and ratings are private to your account.
      </p>

      <h2>Who else handles it</h2>
      <ul>
        <li>
          <strong>Supabase</strong> stores the account and activity data above,
          in the EU (Frankfurt), runs sign-in, and sends account emails.
        </li>
        <li>
          <strong>Vercel</strong> hosts the website.
        </li>
        <li>
          <strong>Google</strong>, only if you choose &ldquo;Continue with
          Google&rdquo;.
        </li>
        <li>
          <strong>TMDB</strong> provides movie and show information. To find
          recommendations we send TMDB the ids of titles you liked, never your
          name, email or account.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>
        We use cookies only to keep you signed in. There are no advertising or
        tracking cookies.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>
          You can remove anything from your lists, or undo a like or rating, at
          any time.
        </li>
        <li>
          To get a copy of your data, or to delete your account and everything
          attached to it, email {mail} from the address on your account.
        </li>
      </ul>

      <h2>Contact</h2>
      <p>Questions about this policy or your data: {mail}.</p>

      <p className={styles.back}>
        <Link href="/">Back to {SITE_NAME}</Link>
      </p>
    </main>
  );
}
