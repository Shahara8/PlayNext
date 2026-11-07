import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  archiveFolderFor,
  archiveRun,
  filesToArchive,
  RAW_FEEDS_BUCKET,
} from "./archive";

const dir = mkdtempSync(join(tmpdir(), "playnext-archive-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
writeFileSync(join(dir, "manifest.json"), "{}");
writeFileSync(join(dir, "YES.jsonl"), '{"a":1}\n');
writeFileSync(join(dir, "notes.txt"), "not archived");

type StorageResult = { data: unknown; error: { message: string } | null };

function fakeStorage(options: {
  bucket?: { public: boolean } | null;
  bucketError?: string;
  create?: StorageResult;
  upload?: StorageResult[];
}) {
  let uploads = 0;
  const upload = vi.fn(
    async () => options.upload?.[uploads++] ?? { data: {}, error: null },
  );
  const storage = {
    getBucket: vi.fn(async () =>
      options.bucket
        ? { data: options.bucket, error: null }
        : {
            data: null,
            error: { message: options.bucketError ?? "Bucket not found" },
          },
    ),
    createBucket: vi.fn(
      async () =>
        options.create ?? { data: { name: RAW_FEEDS_BUCKET }, error: null },
    ),
    from: vi.fn(() => ({ upload })),
  };
  return { client: { storage } as never, storage, upload };
}

describe("archiveFolderFor", () => {
  it("is the UTC date and time, to the millisecond", () => {
    expect(archiveFolderFor(new Date("2026-11-07T03:00:12.345Z"))).toBe(
      "2026-11-07/030012345Z",
    );
  });
});

describe("filesToArchive", () => {
  it("keeps the manifest (first) and every provider file", () => {
    expect(
      filesToArchive([
        "YES.jsonl",
        "notes.txt",
        "manifest.json",
        "PARTNER_TV.jsonl",
        "a.jsonl",
      ]),
    ).toEqual(["manifest.json", "PARTNER_TV.jsonl", "YES.jsonl"]);
  });
});

describe("archiveRun", () => {
  it("uploads the folder's files under the run's folder, never overwriting", async () => {
    const { client, storage, upload } = fakeStorage({
      bucket: { public: false },
    });

    expect(await archiveRun(client, dir, "2026-11-07/030012345Z")).toEqual({
      prefix: "raw-feeds/2026-11-07/030012345Z",
      archived: ["manifest.json", "YES.jsonl"],
      errors: [],
    });

    expect(storage.createBucket).not.toHaveBeenCalled();
    expect(storage.from).toHaveBeenCalledWith(RAW_FEEDS_BUCKET);
    const calls = upload.mock.calls as unknown as [string, Buffer, object][];
    expect(calls.map(([path]) => path)).toEqual([
      "2026-11-07/030012345Z/manifest.json",
      "2026-11-07/030012345Z/YES.jsonl",
    ]);
    expect(calls[1][1].toString()).toBe('{"a":1}\n');
    expect(calls[1][2]).toEqual({
      contentType: "application/x-ndjson",
      upsert: false,
    });
  });

  it("creates the bucket, private, when it's missing", async () => {
    const { client, storage } = fakeStorage({ bucket: null });
    await archiveRun(client, dir, "f");
    expect(storage.createBucket).toHaveBeenCalledWith(RAW_FEEDS_BUCKET, {
      public: false,
    });
  });

  it("reports a bucket it couldn't read, without creating one", async () => {
    const { client, storage } = fakeStorage({
      bucket: null,
      bucketError: "fetch failed",
    });
    await expect(archiveRun(client, dir, "f")).rejects.toThrow(
      /couldn't be read: fetch failed/,
    );
    expect(storage.createBucket).not.toHaveBeenCalled();
  });

  it("refuses a public bucket", async () => {
    const { client, upload } = fakeStorage({ bucket: { public: true } });
    await expect(archiveRun(client, dir, "f")).rejects.toThrow(/is public/);
    expect(upload).not.toHaveBeenCalled();
  });

  it("reports a bucket it couldn't create", async () => {
    const { client } = fakeStorage({
      bucket: null,
      create: { data: null, error: { message: "denied" } },
    });
    await expect(archiveRun(client, dir, "f")).rejects.toThrow(
      /couldn't be created: denied/,
    );
  });

  it("reports a failed upload and still archives the rest", async () => {
    const { client, upload } = fakeStorage({
      bucket: { public: false },
      upload: [{ data: null, error: { message: "exists" } }],
    });
    expect(await archiveRun(client, dir, "f")).toEqual({
      prefix: "raw-feeds/f",
      archived: ["YES.jsonl"],
      errors: ["manifest.json: exists"],
    });
    expect(upload).toHaveBeenCalledTimes(2);
  });
});
