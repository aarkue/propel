import type { PetriNet as ClientPetriNet } from "@r4pm/client";
import { normalizePetriNet, type PetriNet } from "@r4pm/components";
import { Button } from "@r4pm/components/ui";
import { backend } from "../../backends";
import { uniqueArtifactName } from "../../stores";

const EXPORT_PNML = "app_bindings::petri_net_io::export_petri_net_pnml" as const;

/** Convert a net (either shape) to the exact client/Rust shape the bindings deserialize.
 *  A bare cast is not enough: edited nets carry the array shape (arcs as `{ nodes }`), which
 *  the wasm backend rejects with "missing field `from_to`". */
export function toClientNet(net: PetriNet): ClientPetriNet {
  const n = normalizePetriNet(net);
  const placeIds = new Set(n.places.map((p) => p.id));
  return {
    places: Object.fromEntries(n.places.map((p) => [p.id, { id: p.id }])),
    transitions: Object.fromEntries(n.transitions.map((t) => [t.id, { id: t.id, label: t.label ?? null }])),
    arcs: n.arcs.map((a) => {
      const [from, to] = a.nodes;
      const type = placeIds.has(from) ? "PlaceTransition" : "TransitionPlace";
      return { from_to: { type, nodes: [from, to] as [string, string] }, weight: a.weight ?? 1 };
    }),
    initial_marking: n.initial_marking ?? null,
    final_markings: n.final_marking ? [n.final_marking] : null,
  } as ClientPetriNet;
}

/** Save-as-artifact + download-PNML for the given (possibly edited) net. */
export function PetriNetActions({ net }: { net: PetriNet }) {
  return (
    <>
      <Button
        size="1"
        variant="soft"
        onClick={async () => {
          const xml = (await backend.callBinding(EXPORT_PNML, { net: toClientNet(net) })) as string;
          await backend.loadArtifactBytes(
            uniqueArtifactName("Petri net"),
            "PetriNet",
            new TextEncoder().encode(xml),
            ".pnml",
          );
        }}
      >
        Save
      </Button>
      <Button
        size="1"
        variant="soft"
        onClick={async () => {
          const xml = (await backend.callBinding(EXPORT_PNML, { net: toClientNet(net) })) as string;
          await backend.saveBytes(new TextEncoder().encode(xml), "petri-net.pnml", "text/plain");
        }}
      >
        Export PNML
      </Button>
    </>
  );
}
