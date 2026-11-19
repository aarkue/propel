import { lazy } from "react";
import type { EventLogHandle } from "@r4pm/client";
import { PiTreeView } from "react-icons/pi";
import { defineVis } from "./define-vis";

// Mirror of `DEFAULT_PREFIX_TREE_CONTROLS`, to keep the charts bundle out of the initial load.
const DEFAULTS = { minShare: 0.005 };

const PrefixTreeView = lazy(() =>
  import("@r4pm/components/charts").then((m) => ({ default: m.PrefixTreeView })),
);

export const vis = defineVis({
  type: "prefixTree",
  name: "Prefix Tree",
  description: "All traces as a tree of shared prefixes, colored by time until the case ends.",
  category: "variants",
  tags: ["time"],
  icon: PiTreeView,
  supports: ["EventLog"],
  keywords: ["variants", "icicle", "trie", "branching", "remaining time", "sunburst"],
  order: 2,
  controls: { initial: DEFAULTS },
  source: {
    binding: "app_bindings::get_prefix_tree",
    needs: "EventLog",
    args: (ctx, c) => ({ event_log: ctx.datasetId as EventLogHandle, min_share: c.minShare }),
  },
  component: PrefixTreeView,
});
