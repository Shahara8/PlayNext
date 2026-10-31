import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// Lands both the Google OAuth redirect and the email-confirmation link
// (both use Supabase's PKCE flow, which hands back a `?code=` to exchange
// for a session) — one callback covers M5's "both ways" sign-in paths.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/`);
}
