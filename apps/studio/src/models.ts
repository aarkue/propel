import toast from "react-hot-toast";
import type { ObjectCentricPetriNetHandle, ObjectCentricPetriNetJson } from "@r4pm/client";
import { backend } from "./backends";
import { loadItemCached } from "./persistence/session";
import { openOutputAsPanel } from "./panels/pipeline-bridge";
import { quietImports } from "./shell/quiet-imports";
import { uniqueDatasetName, useDatasets } from "./stores";

/**
 * Process models stored as library registry items. They live next to the datasets (same store,
 * chips and persistence) and open in the generic viewer of their return type.
 */
export const MODEL_KINDS = {
  AcceptingPetriNet: { label: "Petri net", returnType: "AcceptingPetriNet" },
  ProcessTree: { label: "Process tree", returnType: "ProcessTree" },
  ObjectCentricPetriNet: { label: "Object-centric Petri net", returnType: "ObjectCentricPetriNetJson" },
} as const;

export type ModelKind = keyof typeof MODEL_KINDS;

export function isModelKind(kind: string): kind is ModelKind {
  return kind in MODEL_KINDS;
}

/** A stored model's JSON, as the bindings and viewers take it. */
export async function getModelValue(id: string): Promise<unknown> {
  const bytes = await backend.exportObject(id, "json");
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** A stored object-centric Petri net in the flat form the viewers and the replay take; its JSON
 *  export is the library's nested form. */
export function getOcpnValue(id: string): Promise<ObjectCentricPetriNetJson> {
  return backend.callBinding("app_bindings::get_ocpn_json", { ocpn: id as ObjectCentricPetriNetHandle });
}

/** Store `value` as a model named after `label` (made unique) and return its id. */
export async function saveModel(kind: ModelKind, label: string, value: unknown): Promise<string> {
  const id = uniqueDatasetName(label);
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  quietImports.add(id);
  await loadItemCached(backend, { id, kind, format: "json", label: id }, bytes);
  useDatasets.getState().addDataset({ id, kind, label: id });
  return id;
}

/** {@link saveModel} with a toast for the outcome, for save buttons. */
export function saveModelFromButton(kind: ModelKind, label: string, value: unknown): void {
  void toast
    .promise(saveModel(kind, label, value), {
      loading: "Saving...",
      success: (id) => `Saved as "${id}"`,
      error: (e) => `Could not save: ${e instanceof Error ? e.message : String(e)}`,
    })
    .catch(() => {});
}

export async function openModel(id: string, kind: ModelKind): Promise<void> {
  const value = kind === "ObjectCentricPetriNet" ? await getOcpnValue(id) : await getModelValue(id);
  const label = useDatasets.getState().datasets.find((d) => d.id === id)?.label ?? id;
  openOutputAsPanel(MODEL_KINDS[kind].returnType, value, label);
}
