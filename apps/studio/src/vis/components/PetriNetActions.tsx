import type { AcceptingPetriNet } from "@r4pm/client";
import { toRustPetriNet, type PetriNet } from "@r4pm/components";
import { Button } from "@r4pm/components/ui";
import { backend } from "../../backends";
import { uniqueArtifactName } from "../../stores";

const EXPORT_PNML = "app_bindings::petri_net_io::export_petri_net_pnml" as const;

/** Convert a net (any shape) to the exact client/Rust shape the bindings deserialize. A bare
 *  cast is not enough: edited nets carry the components' array shape (arcs as `{ nodes }`). */
export function toClientNet(net: PetriNet): AcceptingPetriNet {
  return toRustPetriNet(net);
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
