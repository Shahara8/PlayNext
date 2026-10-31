import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import LoginForm from "@/app/components/login-form";
import styles from "./page.module.css";

// Reads cookies() for the already-signed-in redirect check below, so this
// route can't be prerendered under cacheComponents — a low-traffic page, so
// SSRing it on every request (rather than streaming via Suspense) is fine.
export const instant = false;

export default async function LoginPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/");

  return (
    <main className={styles.main}>
      <h1>Sign in</h1>
      <LoginForm />
    </main>
  );
}
