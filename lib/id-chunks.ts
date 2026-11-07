// `.in()` id lists go into the GET URL, so long lists are split into chunks
// to stay well under URL-length limits.
export const ID_CHUNK_SIZE = 100;

export function chunkIds<T>(ids: readonly T[], size = ID_CHUNK_SIZE): T[][] {
  if (!Number.isInteger(size) || size < 1)
    throw new Error(
      `chunkIds: size must be an integer of at least 1, got ${size}`,
    );
  const chunks: T[][] = [];
  for (let i = 0; i < ids.length; i += size)
    chunks.push(ids.slice(i, i + size));
  return chunks;
}
