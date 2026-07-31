import type { ColumnSchema } from "../types";
import type { EditorMapping, EditorNode } from "../model";

/** ReactFlow node `data` for the four row-graph node components. */
export interface BlueprintNodeData {
  node: EditorNode;
  errorCount?: number;
  /** This node's table schema from the catalog, when known -- a Source node renders it as a
   *  column list, so an undiscovered catalog shows "not discovered" rather than a wrong schema.
   *  `ExtractionCatalog` carries no primary-key information, so unlike OCPQ's TableNode there is
   *  no key marker to show. */
  columns?: Record<string, ColumnSchema>;
  [key: string]: unknown;
}

/** ReactFlow node `data` for a mapping node. */
export interface MappingNodeData {
  mapping: EditorMapping;
  errorCount?: number;
  /** False when the mapping's `node` names nothing in the graph -- drives the "no source
   *  connected" warning, exactly as OCPQ's ExtractorNode did. */
  hasSource?: boolean;
  [key: string]: unknown;
}

/** Widths used for both rendering and ELK layout. Heights are content-driven (a node grows with
 *  its column list / summary lines), so layout uses these as an estimate rather than a fixed
 *  value. */
export const NODE_SIZE = {
  source: { width: 210, height: 120 },
  filter: { width: 190, height: 66 },
  join: { width: 190, height: 78 },
  union: { width: 190, height: 66 },
  mapping: { width: 200, height: 96 },
} as const;
