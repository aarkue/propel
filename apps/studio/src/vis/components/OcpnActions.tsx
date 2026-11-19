import type { Ocpn } from "@r4pm/components";
import { Button } from "@r4pm/components/ui";
import { saveModelFromButton } from "../../models";

/** Save the shown (possibly edited) net as a model, for the Object Animation and other panels to pick. */
export function OcpnSaveButton({ net, name = "OCPN" }: { net: Ocpn; name?: string }) {
  return (
    <Button size="1" variant="soft" onClick={() => saveModelFromButton("ObjectCentricPetriNet", name, net)}>
      Save
    </Button>
  );
}
