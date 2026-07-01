export type FreqItem = { key: string; count: number };

export function normalizeItems(items: FreqItem[] | Record<string, number>): FreqItem[] {
  if (Array.isArray(items)) return items;
  return Object.entries(items).map(([key, count]) => ({ key, count }));
}

export function sortByCountDesc(items: FreqItem[]): FreqItem[] {
  return [...items].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function filterByQuery(items: FreqItem[], query: string): FreqItem[] {
  const q = query.trim().toLowerCase();
  if (q === "") return items;
  return items.filter((i) => i.key.toLowerCase().includes(q));
}

export function selectTopN(items: FreqItem[], n: number): Set<string> {
  return new Set(
    sortByCountDesc(items)
      .slice(0, Math.max(0, n))
      .map((i) => i.key),
  );
}

export function toggle(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}
