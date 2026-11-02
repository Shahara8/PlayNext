import { NextResponse, type NextRequest } from "next/server";
import { getRecommendations, parseLimit } from "@/lib/recommendations";
import {
  createServerSupabaseClient,
  getCurrentUser,
} from "@/lib/supabase-server";

// GET /api/recommendations?limit=N — the viewer's "For You" list. Signed-out
// viewers get the trending list rather than a 401, same as the home page.
export async function GET(request: NextRequest) {
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

  try {
    const user = await getCurrentUser();
    const viewer = user
      ? { supabase: await createServerSupabaseClient(), userId: user.id }
      : null;
    return NextResponse.json(await getRecommendations(viewer, limit));
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Couldn't load recommendations." },
      { status: 500 },
    );
  }
}
