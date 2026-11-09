// The theme setting: System (follow the device), Light or Dark
// (docs/UI_DIRECTION.md Section 3, "Theme mechanism"). Stored in localStorage,
// not a cookie: reading cookies in the root layout would make every page
// dynamic. An inline script in <head> (`themeInitScript`) applies it before
// first paint; the footer's ThemeControl changes it.
//
// In the DOM: an explicit Light/Dark sets `data-theme` on <html>; System
// leaves no attribute, and app/globals.css follows `prefers-color-scheme`.

export const THEME_STORAGE_KEY = "playnext-theme";

export const THEME_SETTINGS = ["system", "light", "dark"] as const;
export type ThemeSetting = (typeof THEME_SETTINGS)[number];
export type Theme = Exclude<ThemeSetting, "system">;

export const DEFAULT_THEME_SETTING: ThemeSetting = "system";

/** A stored value as a setting; anything unknown (or missing) is System. */
export function parseThemeSetting(raw: unknown): ThemeSetting {
  return typeof raw === "string" &&
    (THEME_SETTINGS as readonly string[]).includes(raw)
    ? (raw as ThemeSetting)
    : DEFAULT_THEME_SETTING;
}

/** The `data-theme` value for a setting: null means no attribute. */
export function themeAttribute(setting: ThemeSetting): Theme | null {
  return setting === "system" ? null : setting;
}

/**
 * The inline <head> script: reads the stored setting and sets `data-theme`
 * before first paint, so an explicit choice never flashes the other theme.
 * Self-contained (no imports at run time); storage being unavailable (private
 * mode, blocked site data) leaves the System default.
 */
export function themeInitScript(): string {
  const key = JSON.stringify(THEME_STORAGE_KEY);
  // The stored values that set an attribute, from themeAttribute, so a new
  // setting can't be applied by the control but dropped on reload.
  const explicit = JSON.stringify(
    THEME_SETTINGS.filter((s) => themeAttribute(s) === s),
  );
  return `(function(){try{var t=localStorage.getItem(${key});if(${explicit}.indexOf(t)>=0)document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;
}
