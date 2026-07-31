// Pure helpers behind `ConnectionsDialog.tsx`. Their signatures are the concrete proof of the
// "connections are never part of the blueprint" invariant (spec 1.7, 2.6): none of them take or
// return anything blueprint-shaped -- only `Record<string, string>` in, same out.
export function setConnectionEntry(
  connections: Record<string, string>,
  oldSourceId: string,
  sourceId: string,
  connectionString: string,
): Record<string, string> {
  const entries = Object.entries(connections).map(([id, s]) =>
    id === oldSourceId ? [sourceId, connectionString] : [id, s],
  );
  return Object.fromEntries(entries);
}

export function removeConnectionEntry(
  connections: Record<string, string>,
  sourceId: string,
): Record<string, string> {
  return Object.fromEntries(Object.entries(connections).filter(([id]) => id !== sourceId));
}

export function addConnectionEntry(connections: Record<string, string>): Record<string, string> {
  let id = "source";
  let n = 1;
  while (id in connections) id = `source${n++}`;
  return { ...connections, [id]: "" };
}
