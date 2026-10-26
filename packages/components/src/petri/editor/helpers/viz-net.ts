import type { PetriNet } from "../../../petri-net";
import {
  layoutModel,
  type ModelLayout,
  type ModelLayoutRequest,
  modelLayoutRequest,
  type Ocpn,
  type VizTransport,
} from "../../../viz";
import { toRustPetriNet } from "../../net-json";
import { ocpnElementsSvg, ocpnGraphIds, ocpnStructureKey } from "./ocpn-viz";
import {
  type PetriElements,
  type PetriGraphIds,
  type PetriGraphRefs,
  petriElementsSvg,
  petriGraphIds,
  petriStructureKey,
} from "./viz-layout";

/** The net the editor's nodes and arcs show, as the rust4pm model the editor lays it out, re-routes
 *  and exports with. */
export type PetriVizNet = { model: "petri_net"; net: PetriNet } | { model: "ocpn"; net: Ocpn };

type VizNetModel = PetriVizNet["model"];

/** What the layout request of `vn` depends on, to re-use one while it is unchanged. */
export function vizNetKey(vn: PetriVizNet): string {
  return vn.model === "ocpn" ? ocpnStructureKey(vn.net) : petriStructureKey(toRustPetriNet(vn.net));
}

export function vizNetRequest(viz: VizTransport, vn: PetriVizNet): Promise<ModelLayoutRequest<VizNetModel>> {
  return vn.model === "ocpn"
    ? modelLayoutRequest(viz, "ocpn", vn.net)
    : modelLayoutRequest(viz, "petri_net", toRustPetriNet(vn.net));
}

export function layoutVizNet(viz: VizTransport, vn: PetriVizNet): Promise<ModelLayout<VizNetModel>> {
  return vn.model === "ocpn"
    ? layoutModel(viz, "ocpn", vn.net)
    : layoutModel(viz, "petri_net", toRustPetriNet(vn.net));
}

/** The editor ids behind `refs`, the layout refs of `vn`. */
export function vizNetIds(vn: PetriVizNet, refs: PetriGraphRefs): PetriGraphIds {
  return vn.model === "ocpn" ? ocpnGraphIds(vn.net, refs) : petriGraphIds(vn.net, refs);
}

/** rust4pm's drawing of `vn` at the on-screen geometry of `elements`. An object-centric net takes
 *  `typeColor`'s object type colors. */
export function vizNetSvg(
  viz: VizTransport,
  vn: PetriVizNet,
  elements: PetriElements,
  typeColor?: (objectType: string) => string | undefined,
): Promise<string | null> {
  return vn.model === "ocpn"
    ? ocpnElementsSvg(viz, vn.net, elements, typeColor)
    : petriElementsSvg(viz, vn.net, elements);
}
