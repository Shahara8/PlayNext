import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase-server";
import { signOutAction } from "@/app/auth/actions";
import styles from "./header.module.css";

// Split out of Header so its `cookies()` read (via getCurrentUser) only
// forces *this* slice dynamic under cacheComponents, instead of the whole
// root layout — Header wraps it in <Suspense> for exactly that.
export default async function AuthNav() {
  const user = await getCurrentUser();

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
