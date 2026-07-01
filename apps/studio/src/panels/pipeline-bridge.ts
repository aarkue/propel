import { getDockviewApi } from "../shell/dockviewApi";
import type { PipelineHandle } from "../pipeline";
import { backend } from "../backends";
import { ioKindByName } from "../io-kinds";
// Shared imperative hooks between panels and the pipeline.

/** Imperative handle to the pipeline panel, for the send-to-pipeline bridge. */
export const pipelineRef: { current: PipelineHandle | null } = { current: null };
/** Sends that arrived before the editor mounted, applied (in order) once it does. */
const pendingPipelineActions: ((handle: PipelineHandle) => void)[] = [];
/**
 * Callback ref for the pipeline editor: records the handle on mount (clears on unmount) and flushes
 * any sends that arrived before it was ready.
 */
export const attachPipeline = (handle: PipelineHandle | null) => {
  pipelineRef.current = handle;
  if (handle) for (const action of pendingPipelineActions.splice(0)) action(handle);
};

/** Open + focus the pipeline panel (adding it to the dock if absent). */
function openOrFocusPipeline() {
  const api = getDockviewApi();
  if (!api) return;
  const existing = api.panels.find(
    (p) => p.id === "pipeline" || (p as { component?: string }).component === "pipeline",
  );
  if (existing) existing.api.setActive();
  else api.addPanel({ id: "pipeline", title: "Pipeline", component: "pipeline" });
}

/** Run a send now if the editor is mounted, else queue it for `attachPipeline` to flush on mount. */
function applyOrQueue(action: (handle: PipelineHandle) => void) {
  if (pipelineRef.current) action(pipelineRef.current);
  else pendingPipelineActions.push(action);
}

/**
 * Push a loaded-object handle into the pipeline as an input node.
 * Opens + focuses the pipeline panel first (adding it if absent), then adds an `object` node carrying the handle.
 */
export function sendToPipeline(handle: { id: string; kind: string }) {
  openOrFocusPipeline();
  applyOrQueue((h) => h.addObjectNode(handle));
}

/**
 * Push an engine artifact into the pipeline as a by-value source node.
 * Fetches the value, then adds an `artifact` node carrying it (containing the artifact value).
 */
export async function sendArtifactToPipeline(a: { id: string; kind: string; label: string }) {
  const value = await backend.getArtifact(a.id);
  const returnType = ioKindByName(a.kind)?.returnType ?? a.kind;
  openOrFocusPipeline();
  applyOrQueue((h) => h.addArtifactNode({ value, returnType, label: a.label }));
}

/** Open a pipeline node's output as a standalone viewer panel in the dock. */
export function openOutputAsPanel(returnTypeTitle: string | undefined, data: unknown) {
  const api = getDockviewApi();
  if (!api) return;
  api.addPanel({
    id: `viewer-${Date.now()}`,
    title: returnTypeTitle ?? "Output",
    component: "viewer",
    params: { returnTypeTitle, data },
  });
}
