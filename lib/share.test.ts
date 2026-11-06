import { describe, expect, it, vi } from "vitest";
import { shareLink } from "./share";

const data = {
  title: "The Simpsons (1989)",
  url: "https://x.test/title/tv/456",
};

function domError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

describe("shareLink", () => {
  it("uses the share sheet when there is one", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();

    expect(await shareLink({ share, clipboard: { writeText } }, data)).toBe(
      "shared",
    );
    expect(share).toHaveBeenCalledWith(data);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("treats closing the share sheet as cancelled, without copying", async () => {
    const share = vi.fn().mockRejectedValue(domError("AbortError"));
    const writeText = vi.fn();

    expect(await shareLink({ share, clipboard: { writeText } }, data)).toBe(
      "cancelled",
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to copying when sharing fails otherwise", async () => {
    const share = vi.fn().mockRejectedValue(domError("NotAllowedError"));
    const writeText = vi.fn().mockResolvedValue(undefined);

    expect(await shareLink({ share, clipboard: { writeText } }, data)).toBe(
      "copied",
    );
    expect(writeText).toHaveBeenCalledWith(data.url);
  });

  it("copies when canShare rejects the data", async () => {
    const share = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);

    expect(
      await shareLink(
        { share, canShare: () => false, clipboard: { writeText } },
        data,
      ),
    ).toBe("copied");
    expect(share).not.toHaveBeenCalled();
  });

  it("copies when there's no share sheet", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    expect(await shareLink({ clipboard: { writeText } }, data)).toBe("copied");
  });

  it("fails when neither sharing nor copying works", async () => {
    expect(await shareLink({}, data)).toBe("failed");
    expect(
      await shareLink(
        { clipboard: { writeText: vi.fn().mockRejectedValue(new Error()) } },
        data,
      ),
    ).toBe("failed");
  });
});
