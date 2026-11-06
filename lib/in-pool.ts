// Bounded concurrency: a batch job's way of running many async tasks without
// firing them all at once (TMDB calls, chunked database reads).

/**
 * Runs `task` over `items`, at most `limit` at a time (1 if `limit` isn't a
 * positive number). Rejects with the first task's error; once one fails, no
 * new item is started.
 */
export async function inPool<T>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const workers = Math.min(
    Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : 1,
    items.length,
  );
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        await task(items[index], index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: workers }, worker));
}
