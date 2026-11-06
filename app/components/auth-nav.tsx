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
      <Link href="/login" className={styles.link}>
        Sign in
      </Link>
    );
  }

  const name = userDisplayName(user);

  return (
    <form action={signOutAction} className={styles.userGroup}>
      {name && (
        // Full name on wide screens, first name on phones; the tooltip
        // always says which account it is.
        <span className={styles.userName} title={user.email ?? name.full}>
          <span className={styles.nameFull}>{name.full}</span>
          <span className={styles.nameShort}>{name.short}</span>
        </span>
      )}
      <button type="submit" className={styles.signOutButton}>
        Sign out
      </button>
    </form>
  );
}
