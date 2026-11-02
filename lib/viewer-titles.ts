import { createServerSupabaseClient, getCurrentUser } from "./supabase-server";
import { getTitleStates, type TitleUserState } from "./user-titles";

// Everything a page needs to render title controls for whoever's viewing it:
// null + no states when signed out, so the controls can prompt a sign-in.
// A failed state read sets `unavailable` (controls render disabled) rather
// than failing the catalog page around them or showing them as empty.
export async function getViewerTitleStates(tmdbIds: number[]): Promise<{
  userId: string | null;
  states: Map<number, TitleUserState>;
  unavailable: boolean;
}> {
  const user = await getCurrentUser();
  if (!user) return { userId: null, states: new Map(), unavailable: false };

  try {
    const supabase = await createServerSupabaseClient();
    return {
      userId: user.id,
      states: await getTitleStates(supabase, user.id, tmdbIds),
      unavailable: false,
    };
  } catch (error) {
    console.error(error);
    return { userId: user.id, states: new Map(), unavailable: true };
  }
}
