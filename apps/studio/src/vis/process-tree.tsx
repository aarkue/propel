import { type ProcessTree, ProcessTreeViewer } from "@r4pm/components";
import { Flex } from "@r4pm/components/ui";
import { PiTreeView } from "react-icons/pi";
import {
  DEFAULT_MINER,
  discoverProcessTree,
  type MinerChoice,
  type MinerVariant,
  minerChoice,
} from "./_discovery";
import { defineResolvedVis } from "./define-vis";
import { MinerPicker } from "./components/MinerPicker";

const VARIANTS: readonly MinerVariant[] = ["IM", "IMf", "IMa", "IMd", "IMfd"];

// The generated client types `ProcessTree.root` as the extraction blueprint's `Node`: both Rust types
// are titled `Node` and the codegen keeps one. The payload is rust4pm's tree.
const asTree = (tree: unknown) => tree as ProcessTree;

export const vis = defineResolvedVis({
  type: "processTree",
  name: "Process Tree",
  description: "Discover a process tree (Inductive Miner) from the log.",
  category: "models",
  icon: PiTreeView,
  supports: ["EventLog"],
  keywords: ["process tree", "tree", "model", "discovery", "inductive", "miner", "imf", "imd"],
  order: 7,
  controls: { initial: DEFAULT_MINER as MinerChoice },
  source: {
    needs: "EventLog",
    resolve: async (ctx, c) =>
      asTree(await discoverProcessTree(ctx.backend, ctx.datasetId, minerChoice(c, VARIANTS))),
  },
  viewer: { ProcessTree: asTree },
  panelControlsBar: (c, set) => (
    <Flex align="center" px="2" py="1" style={{ borderBottom: "1px solid var(--gray-5)" }}>
      <MinerPicker value={minerChoice(c, VARIANTS)} onChange={set} variants={VARIANTS} />
    </Flex>
  ),
  component: ProcessTreeViewer,
});
