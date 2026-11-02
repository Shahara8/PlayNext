// `.in()` id lists go into the GET URL, so long lists are split into chunks
// to stay well under URL-length limits.
export const ID_CHUNK_SIZE = 100;

export function chunkIds(ids: number[]): number[][] {
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK_SIZE)
    chunks.push(ids.slice(i, i + ID_CHUNK_SIZE));
  return chunks;
}
