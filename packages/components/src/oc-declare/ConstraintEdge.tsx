import { type Edge, EdgeLabelRenderer, type EdgeProps, useInternalNode } from "@xyflow/react";
import type React from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ACT_NODE_HEIGHT, ACT_NODE_WIDTH } from "./ActivityNode";
import { describeConstraintRich } from "./constraintText";
import { deformPoints, roundedPointsToSvgPath, snapEndpointsToNodeBorders } from "./layout-util";
import { type DotInfo, MultiDot } from "./MultiDot";
import type { ConstraintEdgeData, RenderArcType } from "./types";
import { useVizContext } from "./VizContext";

type ConstraintEdgeType = Edge<ConstraintEdgeData, "constraint">;
type Point = { x: number; y: number };

// Neutral marker color (same for all arcs so the object-type color stays on the path itself).
const MARKER_COLOR = "#4b5563";

/** Point + tangent angle at arc-length parameter t∈[0,1], with optional pixel offset. `points` are
 *  the routed polyline vertices (Rust engine). */
function getPlacementOnCurve(points: Point[], t: number, offsetPx = 0) {
  const sampled = points;
  if (sampled.length < 2) return { x: sampled[0]?.x ?? 0, y: sampled[0]?.y ?? 0, angle: 0 };
  const segs: { dx: number; dy: number; len: number; acc: number }[] = [];
  let acc = 0;
  for (let i = 1; i < sampled.length; i++) {
    const dx = sampled[i].x - sampled[i - 1].x;
    const dy = sampled[i].y - sampled[i - 1].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    acc += len;
    segs.push({ dx, dy, len, acc });
  }
  const totalLen = acc;
  if (totalLen === 0) return { x: sampled[0].x, y: sampled[0].y, angle: 0 };
  let target = t * totalLen + offsetPx;
  if (target < 0) target = 0;
  if (target > totalLen) target = totalLen;
  let startAcc = 0;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (target <= seg.acc || i === segs.length - 1) {
      const st = seg.len > 0 ? (target - startAcc) / seg.len : 0;
      const x = sampled[i].x + st * seg.dx;
      const y = sampled[i].y + st * seg.dy;
      const angle = Math.atan2(seg.dy, seg.dx) * (180 / Math.PI);
      return { x, y, angle };
    }
    startAcc = seg.acc;
  }
  const last = sampled[sampled.length - 1];
  return { x: last.x, y: last.y, angle: 0 };
}

/** Human-readable arc-type label. */
const ARC_TYPE_LABELS: Record<RenderArcType, string> = {
  AS: "Always Succeeds",
  EF: "Eventually Follows",
  EP: "Eventually Precedes",
  DF: "Directly Follows",
  DP: "Directly Precedes",
  EFEP: "Eventually Follows + Precedes",
  DFDP: "Directly Follows + Precedes",
};

export function ConstraintEdge(edge: EdgeProps<ConstraintEdgeType>) {
  const { id: rawId, source, target, data } = edge;
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  // Per-render-instance unique id for all <defs> (gradient + markers): the same
  // graph rendered twice (pipeline preview + panel) must not emit colliding ids,
  // or `url(#id)` resolves across compositing layers to the first one: the
  // gradient stroke ref then fails and the whole arc line disappears.
  const id = `${useId().replace(/[^\w-]/g, "")}-${rawId}`;
  const { activityColor, objectTypeColor, hiddenArcTypes, hiddenObjectTypes, focusedNodeId, hoveredNodeId } =
    useVizContext();

  // Context-menu state: position in viewport pixels (not flow coords).
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
  }, []);

  // Close on any click/scroll/keypress outside the card.
  useEffect(() => {
    if (!menuPos) return;
    const close = () => setMenuPos(null);
    // Use capture + requestAnimationFrame so the opening right-click
    // doesn't immediately trigger the close listener.
    let armed = false;
    const raf = requestAnimationFrame(() => {
      armed = true;
    });
    const onMouseDown = (e: MouseEvent) => {
      if (!armed) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onScroll = () => close();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("contextmenu", onMouseDown, true);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("contextmenu", onMouseDown, true);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuPos]);

  if (!data || !sourceNode || !targetNode) return null;

  // Visibility filters.
  if (hiddenArcTypes.has(data.arcType)) return null;
  const involvedTypes = new Set<string>();
  for (const refs of [data.label.each, data.label.any, data.label.all]) {
    for (const ref of refs) if (ref.object_type) involvedTypes.add(ref.object_type);
  }
  if (involvedTypes.size > 0) {
    const allHidden = [...involvedTypes].every((t) => hiddenObjectTypes.has(t));
    if (allHidden) return null;
  }

  // Dimming from focus / hover state.
  const incidentFocus = focusedNodeId === null || focusedNodeId === source || focusedNodeId === target;
  const incidentHover = hoveredNodeId === null || hoveredNodeId === source || hoveredNodeId === target;
  const opacity = !incidentFocus ? 0.1 : !incidentHover ? 0.25 : 1;

  // Arc-type classification. EFEP / DFDP are synthetic "both-ended" arcs
  // produced by collapsing an EF A->B with its matching EP B->A.
  const isEFEP = data.arcType === "EFEP" || data.arcType === "DFDP";
  const isEF = isEFEP || data.arcType === "EF" || data.arcType === "DF";
  const isEP = isEFEP || data.arcType === "EP" || data.arcType === "DP";
  const isDirect = data.arcType === "DF" || data.arcType === "DP" || data.arcType === "DFDP";

  // Current absolute positions (from React Flow).
  const sourcePos = sourceNode.internals.positionAbsolute;
  const targetPos = targetNode.internals.positionAbsolute;
  const sw = sourceNode.measured?.width ?? ACT_NODE_WIDTH;
  const sh = sourceNode.measured?.height ?? ACT_NODE_HEIGHT;
  const tw = targetNode.measured?.width ?? ACT_NODE_WIDTH;
  const th = targetNode.measured?.height ?? ACT_NODE_HEIGHT;
  const srcCenterX = sourcePos.x + sw / 2;
  const srcCenterY = sourcePos.y + sh / 2;
  const tgtCenterX = targetPos.x + tw / 2;
  const tgtCenterY = targetPos.y + th / 2;

  // Build the dot list in label order (each -> any -> all), filtering out hidden object types.
  const dots: DotInfo[] = [
    ...data.label.each
      .filter((r) => !hiddenObjectTypes.has(r.object_type))
      .map((r) => ({
        objectType: r.object_type,
        color: objectTypeColor(r.object_type),
        quantifier: "each" as const,
      })),
    ...data.label.any
      .filter((r) => !hiddenObjectTypes.has(r.object_type))
      .map((r) => ({
        objectType: r.object_type,
        color: objectTypeColor(r.object_type),
        quantifier: "any" as const,
      })),
    ...data.label.all
      .filter((r) => !hiddenObjectTypes.has(r.object_type))
      .map((r) => ({
        objectType: r.object_type,
        color: objectTypeColor(r.object_type),
        quantifier: "all" as const,
      })),
  ];

  // Weighted gradient along the path: each object type gets a stop proportional to
  // its total weight (each/all = 4, any = 1). Matches the reference implementation.
  const colorEntries: { key: string; color: string; weight: number }[] = [];
  for (const dot of dots) {
    const weight = dot.quantifier === "any" ? 1 : 4;
    const existing = colorEntries.find((e) => e.key === dot.objectType);
    if (existing) existing.weight += weight;
    else colorEntries.push({ key: dot.objectType, color: dot.color, weight });
  }
  const sortedColors = colorEntries.map((e) => e.color);
  const colorWeightsArr = colorEntries.map((e) => e.weight);
  const totalWeight = colorWeightsArr.reduce((s, w) => s + w, 0) || 1;
  const useGradient = sortedColors.length > 1;
  const strokeColor =
    sortedColors.length > 0 ? (useGradient ? `url(#grad-${id})` : sortedColors[0]) : "#4b5563";

  // Items to place along the curve: one per dot, each with its visual width.
  const labelItems = dots.map((dot) => ({ width: dot.quantifier === "each" ? 10 : 17 }));
  const totalLabelWidth = labelItems.reduce((s, it) => s + it.width + 2, 0);
  const startOffset = -totalLabelWidth / 2;
  const T = 0.5;

  // Compute path + label placements.
  let path: string;
  let displacements: { x: number; y: number; angle: number }[] = [];

  if (data.routedPoints && data.layoutSourcePos && data.layoutTargetPos) {
    const sourceDelta = {
      x: sourcePos.x - data.layoutSourcePos.x,
      y: sourcePos.y - data.layoutSourcePos.y,
    };
    const targetDelta = {
      x: targetPos.x - data.layoutTargetPos.x,
      y: targetPos.y - data.layoutTargetPos.y,
    };
    const moved =
      Math.abs(sourceDelta.x) > 0.5 ||
      Math.abs(sourceDelta.y) > 0.5 ||
      Math.abs(targetDelta.x) > 0.5 ||
      Math.abs(targetDelta.y) > 0.5;

    const toPath = (p: Point[]) => roundedPointsToSvgPath(p, 16);
    let points: Point[];
    if (moved) {
      const deformed = deformPoints(data.routedPoints, sourceDelta, targetDelta);
      const srcCenter = { x: sourcePos.x + sw / 2, y: sourcePos.y + sh / 2 };
      const tgtCenter = { x: targetPos.x + tw / 2, y: targetPos.y + th / 2 };
      points = snapEndpointsToNodeBorders(deformed, srcCenter, tgtCenter, sw / 2, sh / 2);
      path = toPath(points);
    } else {
      points = data.routedPoints;
      path = data.routedPath ?? toPath(points);
    }
    let currentOffset = startOffset;
    displacements = labelItems.map((item) => {
      const d = getPlacementOnCurve(points, T, currentOffset + item.width / 2);
      currentOffset += item.width + 2;
      return d;
    });
  } else {
    // Fallback: direct line center-to-center.
    path = `M${srcCenterX},${srcCenterY} L${tgtCenterX},${tgtCenterY}`;
    const dx = tgtCenterX - srcCenterX;
    const dy = tgtCenterY - srcCenterY;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = len > 0 ? dx / len : 0;
    const uy = len > 0 ? dy / len : 0;
    const cx = srcCenterX + dx * T;
    const cy = srcCenterY + dy * T;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    let currentOffset = startOffset;
    displacements = labelItems.map((item) => {
      const off = currentOffset + item.width / 2;
      currentOffset += item.width + 2;
      return { x: cx + ux * off, y: cy + uy * off, angle };
    });
  }

  return (
    <>
      <defs>
        {useGradient && (
          <linearGradient
            id={`grad-${id}`}
            gradientUnits="userSpaceOnUse"
            x1={srcCenterX}
            y1={srcCenterY}
            x2={tgtCenterX}
            y2={tgtCenterY}
          >
            {colorEntries.map((entry, i) => {
              const before = colorWeightsArr.slice(0, i).reduce((s, w) => s + w, 0);
              const mid = before + entry.weight / 2;
              return (
                <stop key={entry.key} offset={`${(mid / totalWeight) * 100}%`} stopColor={entry.color} />
              );
            })}
          </linearGradient>
        )}

        {/* EF start marker: filled circle centered on the node border. */}
        <marker
          id={`circle-${id}`}
          markerWidth="10"
          markerHeight="10"
          viewBox="-20 -20 40 40"
          orient="auto"
          refX="0"
          refY="0"
        >
          <circle cx="0" cy="0" r="10" fill={MARKER_COLOR} />
        </marker>

        {/* EF end marker: filled arrowhead, tip centered on node border. */}
        <marker
          id={`arrow-${id}`}
          markerWidth="10"
          markerHeight="10"
          viewBox="-20 -20 40 40"
          orient="auto"
          refX="10"
          refY="10"
        >
          <path d="M0,0 L20,9.5 L20,10 L20,10.5 L0,20 Z" fill={MARKER_COLOR} />
        </marker>

        {/* EFEP end marker: arrow + circle, circle centered on border. */}
        <marker
          id={`arrow-dot-${id}`}
          markerWidth="16"
          markerHeight="10"
          viewBox="-30 -20 65 40"
          orient="auto"
          refX="0"
          refY="0"
        >
          <path d="M-20,-10 L0,-0.5 L0,0 L0,0.5 L-20,10 Z" fill={MARKER_COLOR} />
          <circle cx="0" cy="0" r="10" fill={MARKER_COLOR} />
        </marker>

        {/* DF end marker: bar + filled arrowhead, tip centered on border. */}
        <marker
          id={`arrow-direct-${id}`}
          markerWidth="10"
          markerHeight="10"
          viewBox="-20 -20 40 40"
          orient="auto"
          refX="10"
          refY="10"
        >
          <path d="M-6.5,0 L-6.5,20 L-3.5,20 L-3.5,0 Z" fill={MARKER_COLOR} />
          <path d="M0,0 L20,9.5 L20,10 L20,10.5 L0,20 Z" fill={MARKER_COLOR} />
        </marker>

        {/* EP start marker: circle centered on border + filled arrow
                    pointing INTO source from outside. */}
        <marker
          id={`ep-start-${id}`}
          markerWidth="15"
          markerHeight="10"
          viewBox="-20 -20 60 40"
          orient="auto"
          refX="0"
          refY="0"
        >
          <circle cx="0" cy="0" r="10" fill={MARKER_COLOR} />
          <path d="M 30,-10 L 10,-0.5 L 10,0 L 10,0.5 L 30,10 Z" fill={MARKER_COLOR} />
        </marker>

        {/* DP start marker: circle centered on border + bar + arrow. */}
        <marker
          id={`dp-start-${id}`}
          markerWidth="15"
          markerHeight="10"
          viewBox="-20 -20 60 40"
          orient="auto"
          refX="0"
          refY="0"
        >
          <circle cx="0" cy="0" r="10" fill={MARKER_COLOR} />
          <path d="M 23.5,-10 L 23.5,10 L 26.5,10 L 26.5,-10 Z" fill={MARKER_COLOR} />
          <path d="M 30,-10 L 10,-0.5 L 10,0 L 10,0.5 L 30,10 Z" fill={MARKER_COLOR} />
        </marker>
      </defs>

      {/* Fat invisible hit path for easier hovering + right-click. */}
      <path
        d={path}
        style={{ cursor: "pointer", pointerEvents: "stroke" }}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onContextMenu={handleContextMenu as unknown as React.SVGProps<SVGPathElement>["onContextMenu"]}
      />

      {/* Visible path: also handles right-click since it sits on top. */}
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={2.5}
        opacity={opacity}
        style={{ pointerEvents: "stroke", cursor: "context-menu" }}
        onContextMenu={handleContextMenu as unknown as React.SVGProps<SVGPathElement>["onContextMenu"]}
        markerStart={
          isEFEP
            ? `url(#circle-${id})`
            : isEP
              ? isDirect
                ? `url(#dp-start-${id})`
                : `url(#ep-start-${id})`
              : `url(#circle-${id})`
        }
        markerEnd={
          isEFEP
            ? `url(#arrow-dot-${id})`
            : isEF
              ? isDirect
                ? `url(#arrow-direct-${id})`
                : `url(#arrow-${id})`
              : undefined
        }
      />

      <EdgeLabelRenderer>
        {dots.map((dot, i) => {
          const { x, y, angle } = displacements[i];
          return (
            <div
              key={`${dot.quantifier}-${dot.objectType}-${i}`}
              onContextMenu={handleContextMenu}
              style={{
                position: "absolute",
                transform: `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${angle}deg)`,
                pointerEvents: "all",
                opacity,
                zIndex: 10,
                display: "flex",
                alignItems: "center",
                cursor: "context-menu",
              }}
            >
              <MultiDot dot={dot} />
            </div>
          );
        })}
      </EdgeLabelRenderer>

      {/* Floating context card: portaled to document body so it's not
                affected by ReactFlow's viewport transform. */}
      {menuPos &&
        createPortal(
          <div
            ref={menuRef}
            className="rounded-lg shadow-xl border border-[var(--gray-6)] p-3 text-[11px] leading-relaxed"
            style={{
              position: "fixed",
              left: menuPos.x,
              top: menuPos.y,
              maxWidth: 320,
              zIndex: 99999,
              background: "var(--color-panel-solid, var(--color-background, #fff))",
            }}
          >
            {/* Header: source -> target */}
            <div className="flex items-center gap-1 mb-1.5 text-[12px] font-semibold">
              <span style={{ color: activityColor(source) }}>{source}</span>
              <span className="text-[var(--gray-8)]">→</span>
              <span style={{ color: activityColor(target) }}>{target}</span>
            </div>

            {/* Arc type badge */}
            <div className="mb-1.5">
              <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--gray-3)] text-[var(--gray-11)] border border-[var(--gray-6)]">
                {data.arcType}
              </span>
              <span className="ml-1.5 text-[var(--gray-9)]">
                {ARC_TYPE_LABELS[data.arcType] ?? data.arcType}
              </span>
            </div>

            {/* Natural language description */}
            <p className="text-[var(--gray-10)] mb-1.5">
              {describeConstraintRich(
                source,
                target,
                data.arcType,
                data.label,
                activityColor,
                objectTypeColor,
              )}
            </p>

            {/* Object involvement */}
            {dots.length > 0 && (
              <div className="pt-1.5 border-t border-[var(--gray-4)]">
                <div className="text-[10px] text-[var(--gray-8)] uppercase tracking-wide mb-1">
                  Involvement
                </div>
                {dots.map((dot) => (
                  <div
                    key={`${dot.quantifier}-${dot.objectType}`}
                    className="flex items-center gap-1.5 mb-0.5"
                  >
                    <MultiDot dot={dot} />
                    <span>
                      <span className="font-medium text-[var(--gray-10)]">{dot.quantifier}</span>
                      <span className="text-[var(--gray-8)]">(</span>
                      <span style={{ color: dot.color, fontWeight: 600 }}>{dot.objectType}</span>
                      <span className="text-[var(--gray-8)]">)</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
