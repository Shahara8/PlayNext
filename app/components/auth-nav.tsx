import { connection } from "next/server";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { signOutAction } from "@/app/auth/actions";
import styles from "./header.module.css";

// Split out of Header so its `cookies()` read (via the server Supabase
// client) only forces *this* slice dynamic under cacheComponents, instead of
// the whole root layout — Header wraps it in <Suspense> for exactly that.
export default async function AuthNav() {
  // supabase-js's getUser() calls Date.now() internally (checking token
  // expiry) — cacheComponents flags that as an "unstable value" unless the
  // component has already been marked dynamic via a Next-recognized API.
  // cookies() (inside createServerSupabaseClient below) doesn't appear to
  // count for that purpose on its own, so connection() does it explicitly.
  await connection();
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    return (
      <Link href="/login" className={styles.link}>
        Sign in
      </Link>
    );
  }

  return (
    <form action={signOutAction} className={styles.userGroup}>
      <span className={styles.userEmail}>{user.email}</span>
      <button type="submit" className={styles.signOutButton}>
        Sign out
      </button>
    </form>
  );
}
