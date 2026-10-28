import type { Provenance } from "@r4pm/client";
import { parseOp } from "../pipeline/lineage-to-pipeline";
import { useArtifacts } from "./artifacts";
import { uniqueDatasetLabel, useDatasets } from "./datasets";

/** Falls back to the id. */
export function objectLabel(id: string): string {
  return (
    useDatasets.getState().datasets.find((d) => d.id === id)?.label ??
    useArtifacts.getState().artifacts.find((a) => a.id === id)?.label ??
    id
  );
}

/** `<source> / <op>`, unique among datasets. */
export function derivedDatasetLabel(sourceId: string, op: string): string {
  return uniqueDatasetLabel(`${objectLabel(sourceId)} / ${op}`);
}

function opName(fn: string): string {
  return (fn.split("::").pop() ?? fn).replace(/_/g, " ");
}

/** e.g. "From Road Traffic via apply event log transforms". */
export function describeProvenance(p: Provenance, labelOf: (id: string) => string = objectLabel): string {
  const from = p.sources.map(labelOf).join(", ");
  const op = parseOp(p.op);
  const via = op
    ? opName(op.fn)
    : typeof p.op === "string" && p.op.startsWith("convert:")
      ? `conversion to ${p.op.slice("convert:".length)}`
      : null;
  if (!from) return via ? `Created via ${via}` : "Derived";
  return via ? `From ${from} via ${via}` : `From ${from}`;
}
