import { createServerSupabaseClient, getCurrentUser } from "./supabase-server";
import type { TitleRef } from "./title-ref";
import { getTitleStates, type TitleUserState } from "./user-titles";

// Everything a page needs to render title controls for whoever's viewing it:
// null + no states when signed out, so the controls can prompt a sign-in.
// A failed state read sets `unavailable` (controls render disabled) rather
// than failing the catalog page around them or showing them as empty.
// `states` is keyed by titleKey ("movie:603").
export async function getViewerTitleStates(refs: readonly TitleRef[]): Promise<{
  userId: string | null;
  states: Map<string, TitleUserState>;
  unavailable: boolean;
}> {
  const user = await getCurrentUser();
  if (!user) return { userId: null, states: new Map(), unavailable: false };

  try {
    const supabase = await createServerSupabaseClient();
    return {
      userId: user.id,
      states: await getTitleStates(supabase, user.id, refs),
      unavailable: false,
    };
  } catch (error) {
    console.error(error);
    return { userId: user.id, states: new Map(), unavailable: true };
  }
}
