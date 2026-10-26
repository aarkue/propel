import type { IDockviewPanelProps } from "dockview";
import { useState } from "react";
import { normalizePetriNet, ObjectCentricPetriNetWorkbench, type Ocpn } from "@r4pm/components";
import { readPanelParam, usePanelDraft } from "../../panels/panel-state";
import { saveOcTraceAsOcel } from "./save-oc-trace";

const EMPTY_OCPN: Ocpn = { places: [], transitions: [], arcs: [], initial_marking: {}, final_marking: {} };

/** A draft saved by the editor before it took rust4pm's flat form: a Petri net, each place's object
 *  type, and per place the variable arcs `[from transitions, to transitions]`. */
interface LegacyDraft {
  petri_net: unknown;
  place_object_type: Record<string, string>;
  place_in_out_mult?: Record<string, [Record<string, boolean>, Record<string, boolean>]>;
}

function fromLegacyDraft(draft: LegacyDraft): Ocpn {
  const net = normalizePetriNet(draft.petri_net);
  const places = new Set(net.places.map((p) => p.id));
  return {
    places: net.places.map((p) => ({ name: p.id, object_type: draft.place_object_type[p.id] ?? "" })),
    transitions: net.transitions.map((t) => ({ name: t.id, label: t.label ?? null })),
    arcs: net.arcs.map(({ nodes: [source, target], weight }) => {
      const fromPlace = places.has(source);
      const [incoming, outgoing] = draft.place_in_out_mult?.[fromPlace ? source : target] ?? [{}, {}];
      const variable = fromPlace ? outgoing[target] : incoming[source];
      return { source, target, type: variable ? "variable" : "normal", weight: weight ?? 1 };
    }),
    initial_marking: net.initial_marking ?? {},
    final_marking: net.final_marking ?? {},
  };
}

function readDraft(draft: Ocpn | LegacyDraft): Ocpn {
  return "petri_net" in draft ? fromLegacyDraft(draft) : draft;
}

/** The workbench re-seeds its editor on every `data` change, so seed once and write edits back via `onNetChange` only. */
export function OcpnEditorPanel(props: IDockviewPanelProps) {
  const [seed] = useState<Ocpn>(() =>
    readDraft(readPanelParam<Ocpn | LegacyDraft>(props.params, "net", EMPTY_OCPN)),
  );
  const [, persist] = usePanelDraft<Ocpn>(props, "net", EMPTY_OCPN);
  return (
    <ObjectCentricPetriNetWorkbench
      data={seed}
      initialMode="edit"
      onNetChange={persist}
      onSaveTraceAsLog={saveOcTraceAsOcel}
    />
  );
}
