import type { SearchEntry } from "@/lib/admin/search";

/** Stable prefix/title/keyword ranking without allocating or sorting every match. */
export function findPaletteResults(
  entries: SearchEntry[],
  query: string,
  limit = 24,
): SearchEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle || limit <= 0) return [];
  const buckets: SearchEntry[][] = [[], [], []];
  for (const entry of entries) {
    if (!entry.keywords.includes(needle)) continue;
    const title = entry.title.toLowerCase();
    const rank = title.startsWith(needle) ? 0 : title.includes(needle) ? 1 : 2;
    if (buckets[rank].length < limit) buckets[rank].push(entry);
    if (buckets[0].length === limit) break;
  }
  return buckets.flat().slice(0, limit);
}
