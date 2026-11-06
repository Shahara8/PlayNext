// Share a link via the OS share sheet where there is one (phones), else copy
// it to the clipboard (most desktop browsers).

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

/** The slice of `navigator` shareLink uses, so tests can pass a fake. */
export interface ShareTarget {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  clipboard?: { writeText: (text: string) => Promise<void> };
}

export async function shareLink(
  target: ShareTarget,
  data: { title: string; url: string },
): Promise<ShareOutcome> {
  if (target.share && (target.canShare?.(data) ?? true)) {
    try {
      await target.share(data);
      return "shared";
    } catch (error) {
      // The viewer closed the share sheet: not a failure, and not a cue to
      // copy behind their back.
      if (error instanceof Error && error.name === "AbortError")
        return "cancelled";
      // Anything else (e.g. NotAllowedError without a user gesture): fall
      // through to the clipboard.
    }
  }
  if (!target.clipboard) return "failed";
  try {
    await target.clipboard.writeText(data.url);
    return "copied";
  } catch {
    return "failed";
  }
}
