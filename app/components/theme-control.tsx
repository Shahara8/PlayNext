"use client";

import { useId, useSyncExternalStore } from "react";
import {
  DEFAULT_THEME_SETTING,
  parseThemeSetting,
  THEME_SETTINGS,
  THEME_STORAGE_KEY,
  themeAttribute,
  type ThemeSetting,
} from "@/lib/theme";
import styles from "./theme-control.module.css";

const LABELS: Record<ThemeSetting, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

// Same-tab changes; the `storage` event covers other tabs.
const CHANGE_EVENT = "playnext-theme-change";

// The choice when storage is blocked (private mode, blocked site data), so
// the control still shows what this page view is using.
let unstoredSetting: ThemeSetting | null = null;

function readSetting(): ThemeSetting {
  if (unstoredSetting) return unstoredSetting;
  try {
    return parseThemeSetting(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_SETTING;
  }
}

/** Applies the setting to <html>, as the <head> script does on load. */
function applySetting(setting: ThemeSetting) {
  const attr = themeAttribute(setting);
  if (attr) document.documentElement.setAttribute("data-theme", attr);
  else document.documentElement.removeAttribute("data-theme");
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    // Another tab changed the setting: follow it here too.
    if (e.key !== THEME_STORAGE_KEY && e.key !== null) return;
    applySetting(readSetting());
    onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Stores and applies a choice, and tells this tab's controls. */
function saveSetting(next: ThemeSetting) {
  try {
    if (next === DEFAULT_THEME_SETTING)
      localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
    unstoredSetting = null;
  } catch {
    // Storage blocked: the choice still applies to this page view.
    unstoredSetting = next;
  }
  applySetting(next);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** The footer's "Theme: System · Light · Dark" control (lib/theme.ts). */
export default function ThemeControl() {
  // The server (and hydration) render System; the stored choice shows right
  // after. The page itself is already in the right theme from the script.
  const setting = useSyncExternalStore(
    subscribe,
    readSetting,
    () => DEFAULT_THEME_SETTING,
  );
  const labelId = useId();

  return (
    <div className={styles.control}>
      <span id={labelId}>Theme</span>
      <div className="segmented" role="group" aria-labelledby={labelId}>
        {THEME_SETTINGS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={setting === s}
            onClick={() => saveSetting(s)}
          >
            {LABELS[s]}
          </button>
        ))}
      </div>
    </div>
  );
}
