import { useCallback, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import type { Edge } from "@xyflow/react";
import type { ArcData, PetriNetNode } from "../Editor";
import { type ModelLayoutRequest, rerouteModel, type VizTransport } from "../../../viz";
import { applyPetriLayout, type PetriElements, petriPositions } from "./viz-layout";
import { layoutVizNet, type PetriVizNet, vizNetIds, vizNetKey, vizNetRequest } from "./viz-net";

/** Lay out and re-route the editor's net with rust4pm. `netOf` gives the net the nodes and arcs show.
 *  `onLayoutChange` gets the nodes and arcs after each change. */
export function usePetriVizLayout(
  viz: VizTransport | undefined,
  netOf: (elements: PetriElements) => PetriVizNet,
  onLayoutChange?: (nodes: PetriNetNode[], edges: Edge<ArcData>[]) => void,
) {
  const { getNodes, setNodes, getEdges, setEdges, fitView } = useReactFlow();
  const netOfRef = useRef(netOf);
  netOfRef.current = netOf;
  const onLayoutChangeRef = useRef(onLayoutChange);
  onLayoutChangeRef.current = onLayoutChange;
  // The request of the last layout or re-route, re-used while the net's structure is unchanged.
  const last = useRef<{ key: string; request: ModelLayoutRequest<PetriVizNet["model"]> } | null>(null);
  // Only the newest call applies its result: an older one finishing late would undo it.
  const generation = useRef(0);

  const elements = useCallback(
    (): PetriElements => ({ nodes: getNodes() as PetriNetNode[], edges: getEdges() as Edge<ArcData>[] }),
    [getNodes, getEdges],
  );

  const apply = useCallback(
    (result: PetriElements) => {
      setNodes(result.nodes);
      setEdges(result.edges);
      onLayoutChangeRef.current?.(result.nodes, result.edges);
    },
    [setNodes, setEdges],
  );

  /** Lay the net out anew. */
  const relayout = useCallback(async () => {
    if (!viz) return;
    const gen = ++generation.current;
    const net = netOfRef.current(elements());
    try {
      const laid = await layoutVizNet(viz, net);
      if (gen !== generation.current) return;
      last.current = { key: vizNetKey(net), request: laid };
      apply(applyPetriLayout(vizNetIds(net, laid), laid.layout, elements()));
      setTimeout(() => fitView({ duration: 200 }), 50);
    } catch (e) {
      console.error("[petri] layout failed:", e);
    }
  }, [viz, elements, apply, fitView]);

  /** Re-route the arcs over the current node centres. Nodes keep their positions, including nodes
   *  added since the last layout. `moved` are nodes at
   *  newer positions than the editor's state has, e.g., the dropped ones: a drag's last move may not
   *  be committed yet when it stops. */
  const reroute = useCallback(
    async (moved: { id: string; position: { x: number; y: number } }[] = []) => {
      if (!viz) return;
      const gen = ++generation.current;
      const dropped = new Map(moved.map((n) => [n.id, n.position]));
      const current = elements();
      const before = {
        ...current,
        nodes: current.nodes.map((n) => (dropped.has(n.id) ? { ...n, position: dropped.get(n.id)! } : n)),
      };
      const net = netOfRef.current(before);
      const key = vizNetKey(net);
      try {
        const request = last.current?.key === key ? last.current.request : await vizNetRequest(viz, net);
        last.current = { key, request };
        const ids = vizNetIds(net, request);
        const positions = petriPositions(ids, before.nodes);
        const layout = await rerouteModel(viz, request, positions);
        if (gen !== generation.current) return;
        apply(applyPetriLayout(ids, layout, elements(), positions));
      } catch (e) {
        console.error("[petri] re-route failed:", e);
      }
    },
    [viz, elements, apply],
  );

  return { relayout, reroute };
}
