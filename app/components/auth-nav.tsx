import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase-server";
import { userDisplayName } from "@/lib/auth";
import { signOutAction } from "@/app/auth/actions";
import styles from "./header.module.css";

// Split out of Header so its `cookies()` read (via getCurrentUser) only
// forces *this* slice dynamic under cacheComponents, instead of the whole
// root layout — Header wraps it in <Suspense> for exactly that.
export default async function AuthNav() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Link href="/login" className={`btn btn-primary ${styles.signIn}`}>
        Sign in
      </Link>
    );
  }

  const name = userDisplayName(user);

  return (
    <form action={signOutAction} className={styles.userGroup}>
      {name && (
        // First name only, at every width; the tooltip says which account.
        <span className={styles.userName} title={user.email ?? name.full}>
          {name.short}
        </span>
      )}
      <button type="submit" className={styles.link}>
        Sign out
      </button>
    </form>
  );
}
