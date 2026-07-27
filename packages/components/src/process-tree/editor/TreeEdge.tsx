import type { EdgeProps, Node } from "@xyflow/react";
import RoutedEdge from "../../graph-edit/RoutedEdge";
import { geomOfType } from "./helpers/layout-graph";

const geomOf = (node: Node) => geomOfType(node.type as "operator" | "leaf");

/** A parent->child tree edge. */
export default function TreeEdge(props: EdgeProps) {
  return <RoutedEdge {...props} geomOf={geomOf} />;
}
