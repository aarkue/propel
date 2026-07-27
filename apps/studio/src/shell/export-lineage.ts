import toast from "react-hot-toast";
import { backend } from "../backends";
import { ioKindByName } from "../io-kinds";
import { sendGraphToPipeline } from "../panels/pipeline-bridge";
import {
  buildPipelineFromLineage,
  type LineageObject,
  reachableRootArtifactIds,
} from "../pipeline/lineage-to-pipeline";
import { useArtifacts } from "../stores/artifacts";
import { useDatasets } from "../stores/datasets";

function allLineageObjects(): Map<string, LineageObject> {
  const m = new Map<string, LineageObject>();
  for (const d of useDatasets.getState().datasets)
    m.set(d.id, { id: d.id, kind: d.kind, label: d.label, storeKind: "dataset", provenance: d.provenance });
  for (const a of useArtifacts.getState().artifacts)
    m.set(a.id, { id: a.id, kind: a.kind, label: a.label, storeKind: "artifact", provenance: a.provenance });
  return m;
}

export async function exportLineageAsPipeline(rootId: string): Promise<void> {
  try {
    const objectsById = allLineageObjects();
    const functions = await backend.listFunctions();
    const functionsById = new Map(functions.map((f) => [f.id, f]));

    // Root artifact source nodes carry their value; prefetch only reachable roots.
    const artifactCache = new Map<string, unknown>();
    await Promise.all(
      reachableRootArtifactIds(rootId, objectsById).map(async (id) => {
        try {
          artifactCache.set(id, await backend.getArtifact(id));
        } catch {
          // best-effort: a missing value leaves the artifact node empty
        }
      }),
    );

    const { nodes, edges, warnings } = buildPipelineFromLineage({
      rootId,
      objectsById,
      functionsById,
      artifactValue: (id) => artifactCache.get(id),
      artifactReturnType: (k) => ioKindByName(k)?.returnType ?? k,
    });
    if (nodes.length === 0) {
      toast.error("Nothing to export: no recorded lineage for this object.");
      return;
    }
    sendGraphToPipeline(nodes, edges);
    if (warnings.length > 0) toast(`Exported with ${warnings.length} note(s): ${warnings[0]}`);
  } catch {
    toast.error("Could not export as pipeline.");
  }
}
