"use client";

import { useEffect, useRef, useState } from "react";
import { shareLink, type ShareOutcome } from "@/lib/share";
import styles from "./share-button.module.css";

const STATUS_LABEL: Partial<Record<ShareOutcome, string>> = {
  copied: "Link copied",
  failed: "Couldn't share",
};
const STATUS_MS = 2000;

export default function ShareButton({
  path,
  title,
}: {
  path: string;
  title: string;
}) {
  // A fresh object per click, so a repeat outcome restarts the timer.
  const [status, setStatus] = useState<{ outcome: ShareOutcome } | null>(null);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), STATUS_MS);
    return () => clearTimeout(timer);
  }, [status]);

  // A second tap while the share sheet is open would reject with
  // InvalidStateError and fall through to copying behind the sheet.
  const busy = useRef(false);

  async function handleClick() {
    if (busy.current) return;
    busy.current = true;
    try {
      const url = new URL(path, window.location.origin).toString();
      setStatus({ outcome: await shareLink(navigator, { title, url }) });
    } finally {
      busy.current = false;
    }
  }

  return (
    <button
      type="button"
      className={`btn btn-secondary ${styles.button}`}
      onClick={handleClick}
    >
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3v12" />
        <path d="m7 8 5-5 5 5" />
        <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
      </svg>
      <span aria-live="polite">
        {(status && STATUS_LABEL[status.outcome]) ?? "Share"}
      </span>
    </button>
  );
}
