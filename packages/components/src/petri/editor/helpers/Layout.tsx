import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import type { LayoutOptions } from "elkjs";
import type { Edge } from "@xyflow/react";
import type { ArcData, PetriNetNode } from "../Editor";
import { layoutPetriNet } from "./layout-graph";

export const useLayoutedElements = () => {
  const { getNodes, setNodes, getEdges, setEdges, fitView } = useReactFlow();

  const getLayoutedElements = useCallback(
    (options: LayoutOptions = {}, fitViewAfter = true) => {
      void layoutPetriNet(getNodes() as PetriNetNode[], getEdges() as Edge<ArcData>[], options).then(
        ({ nodes, edges }) => {
          setNodes(nodes);
          setEdges(edges);
          if (fitViewAfter) {
            setTimeout(() => fitView({ duration: 200 }), 50);
          }
        },
      );
    },
    [fitView, setNodes, setEdges, getNodes, getEdges],
  );

  return { getLayoutedElements };
};
