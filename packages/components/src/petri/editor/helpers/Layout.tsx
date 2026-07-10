import { useCallback, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import type { Edge } from "@xyflow/react";
import type { ArcData, PetriNetNode } from "../Editor";
import { noopPetriLayout, type PetriLayoutFn } from "./layout-graph";

export const useLayoutedElements = (layout: PetriLayoutFn = noopPetriLayout) => {
  const { getNodes, setNodes, getEdges, setEdges, fitView } = useReactFlow();
  // Nodes the user has manually placed; they stay pinned across later drag-relayouts so earlier
  // placements don't revert. A full auto-layout ("Tidy") clears them.
  const pinnedIds = useRef<Set<string>>(new Set());

  const getLayoutedElements = useCallback(
    (_options?: unknown, fitViewAfter = true) => {
      pinnedIds.current.clear(); // a full auto-layout supersedes manual placements
      void layout(getNodes() as PetriNetNode[], getEdges() as Edge<ArcData>[]).then(({ nodes, edges }) => {
        setNodes(nodes);
        setEdges(edges);
        if (fitViewAfter) {
          setTimeout(() => fitView({ duration: 200 }), 50);
        }
      });
    },
    [layout, fitView, setNodes, setEdges, getNodes, getEdges],
  );

  /** Stable relayout: seed every node at its current centre so un-dragged nodes stay put, pinning
   *  `pinnedId` (the just-dragged node) so it holds exactly where it was dropped. Only edges (and any
   *  nodes the drop crowds) move. No fitView - the view shouldn't jump on a nudge. */
  const relayoutStable = useCallback(
    (pinnedId?: string) => {
      if (pinnedId) pinnedIds.current.add(pinnedId);
      void layout(getNodes() as PetriNetNode[], getEdges() as Edge<ArcData>[], {
        // Re-route from the dropped positions: rebuild the grid from geometry so arcs route cleanly
        // around boxes instead of following a stale topological chain.
        reroute: true,
        seed: (n) => ({ x: n.position.x, y: n.position.y, pinned: pinnedIds.current.has(n.id) }),
      })
        .then(({ nodes, edges }) => {
          setNodes(nodes);
          setEdges(edges);
        })
        .catch((e) => console.error("[petri] stable relayout failed:", e));
    },
    [layout, setNodes, setEdges, getNodes, getEdges],
  );

  return { getLayoutedElements, relayoutStable };
};
