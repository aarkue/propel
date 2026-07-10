/**
 * Shared self-loop bump geometry for the DFG. Both the on-screen edge (`DfgEdge.tsx`) and the SVG
 * export (`styled-graph.ts`) build the loop from this, so screen and export stay identical.
 *
 * The bump sits on the free cross-axis - the side perpendicular to the layer flow, where no forward
 * edges live. TB (top->bottom flow) puts it on the node's right; LR (left->right flow) puts it on the
 * bottom. This matches the clearance the layout reserves on each node's positive order side (screen
 * right in TB, screen bottom in LR); drawing it on the flow axis instead would collide with the
 * forward edges leaving that side.
 */

export type FlowDirection = "TB" | "LR";

type Pt = { x: number; y: number };

export interface SelfLoopGeometry {
  p0: Pt;
  c1: Pt;
  c2: Pt;
  p3: Pt;
  labelX: number;
  labelY: number;
}

/** Cubic-bezier control points (+ label anchor) for a node's self-loop, on the cross-axis side for
 *  `direction`. `parallelIndex` fans stacked loops outward; `strokeWidth` sizes the arrow inset. */
export function selfLoopBezier(
  box: { x: number; y: number; width: number; height: number },
  parallelIndex: number,
  strokeWidth: number,
  direction: FlowDirection,
): SelfLoopGeometry {
  const loopW = 36 + parallelIndex * 24;
  const arrowInset = Math.max(14, strokeWidth * 4) * 0.35;

  if (direction === "LR") {
    // Bump below the node: leaves the bottom border near the left, loops down, returns near the right
    // with the arrowhead pointing back up into the node.
    const startX = box.x + box.width * 0.3;
    const startY = box.y + box.height;
    const endX = box.x + box.width * 0.7;
    const endY = box.y + box.height + arrowInset;
    return {
      p0: { x: startX, y: startY },
      c1: { x: startX - 4, y: startY + loopW },
      c2: { x: endX + 4, y: endY + loopW },
      p3: { x: endX, y: endY },
      labelX: (startX + endX) / 2,
      labelY: startY + loopW * 0.75,
    };
  }

  // TB: bump right of the node, arrowhead pointing back left into it.
  const startX = box.x + box.width;
  const startY = box.y + box.height * 0.3;
  const endX = box.x + box.width + arrowInset;
  const endY = box.y + box.height * 0.7;
  return {
    p0: { x: startX, y: startY },
    c1: { x: startX + loopW, y: startY - 4 },
    c2: { x: endX + loopW, y: endY + 4 },
    p3: { x: endX, y: endY },
    labelX: startX + loopW * 0.75,
    labelY: (startY + endY) / 2,
  };
}
