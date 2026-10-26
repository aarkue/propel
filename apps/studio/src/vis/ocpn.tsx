import { PiShareNetwork } from "react-icons/pi";
import { defineResolvedVis } from "./define-vis";
import { OcpnDiscoveryBar } from "./components/OcpnDiscoveryBar";
import { OcpnPanel } from "./components/OcpnPanel";
import { discoverOcpn, OCPN_DISCOVERY_DEFAULTS, ocpnDiscovery } from "./_ocpn-discovery";

export const vis = defineResolvedVis({
  type: "ocpn",
  name: "Object-Centric Petri Net",
  description: "Discover an object-centric Petri net (Inductive Miner per object type) from the OCEL.",
  category: "ocel",
  tags: ["models"],
  icon: PiShareNetwork,
  supports: ["SlimLinkedOCEL"],
  keywords: [
    "ocpn",
    "object-centric",
    "petri",
    "net",
    "model",
    "discovery",
    "inductive",
    "miner",
    "simulate",
  ],
  order: 15,
  controls: { initial: OCPN_DISCOVERY_DEFAULTS },
  source: {
    needs: "SlimLinkedOCEL",
    resolve: (ctx, c) => discoverOcpn(ctx.backend, ctx.datasetId, ocpnDiscovery(c)),
  },
  // The OCPN viewer (`viewers/object-centric-petri-net.ts`) shows this return type everywhere else.
  viewer: false,
  panelControlsBar: (c, set, datasetId) => (
    <OcpnDiscoveryBar value={ocpnDiscovery(c)} onChange={set} ocel={datasetId} />
  ),
  component: OcpnPanel,
});
