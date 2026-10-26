import { type Edge, EdgeLabelRenderer, type EdgeProps, useInternalNode } from "@xyflow/react";
import type React from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { describeConstraintRich } from "./constraintText";
import type { OCDeclareArcLabel, ObjectTypeAssociation } from "./index";
import { roundedPointsToSvgPath } from "./layout-util";
import { type DotInfo, MultiDot } from "./MultiDot";
import type { ActivityNodeData, ConstraintEdgeData, ObjectTypeRef, RenderArcType } from "./types";
import { type ColorResolver, useVizContext } from "./VizContext";
import { useEditContext } from "./edit/edit-context";
import { EdgeEditControl, MergedEdgeEditControl } from "./edit/EdgeEditControl";
import { cardinalitySugar, type EdgeTemplate, TEMPLATE_TO_ARC } from "./model";
import {
  BADGE_FONT_SIZE,
  BADGE_HEIGHT,
  edgePolyline,
  edgeVisible,
  nodeBox,
  placeOnCurve,
  type ViolationBadge,
  violationBadges,
} from "./viz-layout";

/**
 * The types an association references, and how to draw it. An O2O association carries no
 * `object_type` at all, only `first`/`second`. It draws as a split disc whose left half is the type
 * the relation points from; without the split it would be an unnamed dot in the fallback colour.
 */
function refToDot(
  ref: ObjectTypeRef,
  objectTypeColor: ColorResolver,
): { objectType: string; color: string; color2?: string; types: string[] } {
  if (ref.type === "O2O" && ref.first && ref.second) {
    const [from, to] = ref.reversed ? [ref.second, ref.first] : [ref.first, ref.second];
    return {
      // The involvement editor's own notation, so the tooltip reads the way the arc was written.
      objectType: `${ref.first} ${ref.reversed ? "◄" : "►"} ${ref.second}`,
      color: objectTypeColor(from),
      color2: objectTypeColor(to),
      types: [ref.first, ref.second],
    };
  }
  return { objectType: ref.object_type, color: objectTypeColor(ref.object_type), types: [ref.object_type] };
}

/** Badge sits on top of the arc, so it carries its own ring to stay legible against the path. */
function violationBadgeStyle(badge: ViolationBadge): React.CSSProperties {
  return {
    // Sets its own box: as a plain inline span the background would follow the font metrics instead
    // of `lineHeight`, which renders it shorter under a non-flex parent than a flex one.
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: badge.width,
    boxSizing: "border-box",
    color: "#fff",
    background: badge.color,
    borderRadius: 4,
    padding: "0 4px",
    fontSize: BADGE_FONT_SIZE,
    lineHeight: `${BADGE_HEIGHT}px`,
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    boxShadow: "0 0 0 1.5px var(--color-panel-solid, #fff), 0 1px 2px rgba(0,0,0,0.28)",
  };
}

type ConstraintEdgeType = Edge<ConstraintEdgeData, "constraint">;
type Point = { x: number; y: number };

// Neutral marker color, same for all arcs so the object-type color stays on the path itself.
const MARKER_COLOR = "#4b5563";

// The `//` of a negated arc as rust4pm draws it in the export (`push_slashes` in its
// visualization/oc_declare.rs), but placed on the drawn path, so it follows rounded corners.
const NEGATION_COLOR = "#dc2626";
const SLASH_LENGTH = 13;
const SLASH_SLANT = (-22.6 * Math.PI) / 180;
const SLASH_GAP = 5;
const SLASH_DISTANCE = 27;
const SLASH_CLEARANCE = 3;
const END_CLEARANCE = 20;
const SLASH_KEYS = ["first", "second"];

/** What the `//` keeps clear of: discs around the line's middle, or a text label at a point. */
type SlashObstacle = { half: number; at?: Point };

function nearestLength(path: SVGPathElement, length: number, p: Point): number {
  let best = Number.POSITIVE_INFINITY;
  let at = 0;
  for (let s = 0; s <= length; s += 2) {
    const q = path.getPointAtLength(s);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < best) {
      best = d;
      at = s;
    }
  }
  return at;
}

/** The two strokes: `SLASH_DISTANCE` before the target end, or beside the obstacle when that spot
 *  overlaps it. */
function slashLines(path: SVGPathElement, obstacle?: SlashObstacle): [Point, Point][] {
  const length = path.getTotalLength();
  if (length === 0) return [];
  const half = SLASH_GAP / 2 + (SLASH_LENGTH / 2) * Math.abs(Math.sin(SLASH_SLANT));
  const room = length / 2 - END_CLEARANCE - half;
  let centre = length / 2 - SLASH_DISTANCE;
  if (obstacle && obstacle.half > 0) {
    const mid = obstacle.at ? nearestLength(path, length, obstacle.at) - length / 2 : 0;
    const [lo, hi] = [mid - obstacle.half, mid + obstacle.half];
    if (centre - half < hi + SLASH_CLEARANCE && centre + half > lo - SLASH_CLEARANCE) {
      const after = hi + SLASH_CLEARANCE + half;
      const before = lo - SLASH_CLEARANCE - half;
      centre = after <= room || before < -room ? after : before;
    }
  }
  const [sin, cos] = [Math.sin(SLASH_SLANT), Math.cos(SLASH_SLANT)];
  return [-SLASH_GAP / 2, SLASH_GAP / 2].map((offset) => {
    const s = Math.min(length, Math.max(0, length / 2 + centre + offset));
    const p = path.getPointAtLength(s);
    const a = path.getPointAtLength(Math.max(0, s - 1));
    const b = path.getPointAtLength(Math.min(length, s + 1));
    const step = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const [dx, dy] = [(b.x - a.x) / step, (b.y - a.y) / step];
    // The perpendicular to the path, turned by the slant towards it.
    const [nx, ny] = [-dy * cos + dx * sin, dx * cos + dy * sin];
    const r = SLASH_LENGTH / 2;
    return [
      { x: p.x - nx * r, y: p.y - ny * r },
      { x: p.x + nx * r, y: p.y + ny * r },
    ];
  });
}

/** The `//` on the path `d`, measured on a hidden copy of it after each layout. */
function NegationSlashes({ d, obstacle, opacity }: { d: string; obstacle?: SlashObstacle; opacity: number }) {
  const ref = useRef<SVGPathElement>(null);
  const [lines, setLines] = useState<[Point, Point][]>([]);
  const key = JSON.stringify([d, obstacle]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for `d` and `obstacle`
  useLayoutEffect(() => {
    if (ref.current) setLines(slashLines(ref.current, obstacle));
  }, [key]);
  return (
    <g pointerEvents="none" opacity={opacity}>
      <path ref={ref} d={d} fill="none" stroke="none" />
      {lines.map(([a, b], i) => (
        <line
          // Fixed keys: two strokes can share a point, and duplicate keys leave strokes behind.
          key={SLASH_KEYS[i]}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={NEGATION_COLOR}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}
    </g>
  );
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
  // Per-render-instance unique id for all <defs>: the same graph rendered twice must not emit colliding ids, or `url(#id)` resolves to the first one and the gradient stroke fails.
  const id = `${useId().replace(/[^\w-]/g, "")}-${rawId}`;
  const {
    activityColor,
    objectTypeColor,
    hiddenArcTypes,
    hiddenObjectTypes,
    focusedNodeId,
    hoveredNodeId,
    showTextLabels,
    reportBadges,
  } = useVizContext();

  const edit = useEditContext();
  // Context-menu state: position in viewport pixels (not flow coords).
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [edgeHovered, setEdgeHovered] = useState(false);
  // The text label's width, so the violation badges and the `//` of a negated arc can step around
  // it. Measured on every commit, since the label changes with the arc's object types.
  const [labelWidth, setLabelWidth] = useState(0);
  const measureLabel = (el: HTMLDivElement | null) => {
    if (el) setLabelWidth(el.offsetWidth);
  };
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEdgeEnter = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setEdgeHovered(true);
  }, []);
  const onEdgeLeave = useCallback(() => {
    hoverTimer.current = setTimeout(() => setEdgeHovered(false), 80);
  }, []);

  // Right-click always shows the read-only description card; editing is a separate affordance (hover pencil -> edit popover).
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
  }, []);

  // Close on any click/scroll/keypress outside the card.
  useEffect(() => {
    if (!menuPos) return;
    const close = () => setMenuPos(null);
    // Capture + rAF so the opening right-click doesn't immediately trigger the close listener.
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

  // The badges as drawn, handed to the export after every commit (none while the arc is hidden).
  const drawnBadges = useRef<ViolationBadge[] | null>(null);
  drawnBadges.current = null;
  useEffect(() => {
    reportBadges?.(rawId, drawnBadges.current);
  });
  useEffect(() => () => reportBadges?.(rawId, null), [reportBadges, rawId]);

  if (!data || !sourceNode || !targetNode) return null;

  // `source`/`target` are node IDs; resolve display names from node data so the card never shows raw ids.
  const sourceLabel = (sourceNode.data as ActivityNodeData | undefined)?.label ?? source;
  const targetLabel = (targetNode.data as ActivityNodeData | undefined)?.label ?? target;

  // Editing extras carried on edge data (present in edit mode): cardinality label and negation.
  const template = data.template as EdgeTemplate | undefined;
  const negated = template ? TEMPLATE_TO_ARC[template].negated : false;
  // A negated arc's count is 0. A cardinality left over from before negating does not apply.
  const cardText = negated
    ? undefined
    : cardinalitySugar(data.cardinality as [number | null, number | null] | undefined);
  if (!edgeVisible(data, hiddenArcTypes, hiddenObjectTypes)) return null;

  // Dimming from focus / hover state.
  const incidentFocus = focusedNodeId === null || focusedNodeId === source || focusedNodeId === target;
  const incidentHover = hoveredNodeId === null || hoveredNodeId === source || hoveredNodeId === target;
  const opacity = !incidentFocus ? 0.1 : !incidentHover ? 0.25 : 1;

  // EFEP / DFDP are synthetic "both-ended" arcs from collapsing an EF A->B with its matching EP B->A.
  const isEFEP = data.arcType === "EFEP" || data.arcType === "DFDP";
  const isEF = isEFEP || data.arcType === "EF" || data.arcType === "DF";
  const isEP = isEFEP || data.arcType === "EP" || data.arcType === "DP";
  const isDirect = data.arcType === "DF" || data.arcType === "DP" || data.arcType === "DFDP";

  const srcBox = nodeBox({ ...sourceNode, position: sourceNode.internals.positionAbsolute });
  const tgtBox = nodeBox({ ...targetNode, position: targetNode.internals.positionAbsolute });
  const srcCenterX = srcBox.position.x + srcBox.width / 2;
  const srcCenterY = srcBox.position.y + srcBox.height / 2;
  const tgtCenterX = tgtBox.position.x + tgtBox.width / 2;
  const tgtCenterY = tgtBox.position.y + tgtBox.height / 2;

  // Build the dot list in label order (each -> any -> all), filtering out hidden object types.
  const quantified = (refs: ObjectTypeRef[], quantifier: "each" | "any" | "all"): DotInfo[] =>
    refs
      .map((r) => ({ ...refToDot(r, objectTypeColor), quantifier }))
      // Hidden only when every type it references is hidden, matching the arc-level check above.
      .filter((d) => !d.types.every((t) => hiddenObjectTypes.has(t)))
      .map(({ types: _types, ...dot }) => dot);

  const dots: DotInfo[] = [
    ...quantified(data.label.each, "each"),
    ...quantified(data.label.any, "any"),
    ...quantified(data.label.all, "all"),
  ];

  // The edit model stashes the O2O-lossless `rawLabel`; the read-only viewer rebuilds it from the
  // refs, which carry the relation, keeping a text label from reading an O2O as a plain type.
  const asAssoc = (r: ObjectTypeRef): ObjectTypeAssociation =>
    r.type === "O2O" && r.first && r.second
      ? { type: "O2O", first: r.first, second: r.second, reversed: r.reversed ?? false }
      : { type: "Simple", object_type: r.object_type };
  const rawLabel = data.rawLabel as OCDeclareArcLabel | undefined;
  const textLabel: OCDeclareArcLabel = rawLabel ?? {
    each: data.label.each.map(asAssoc),
    all: data.label.all.map(asAssoc),
    any: data.label.any.map(asAssoc),
  };

  // Weighted gradient: each object type gets a stop proportional to its total weight (each/all = 4, any = 1).
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

  const shown = edgePolyline(data, srcBox, tgtBox, source === target);
  const curvePoints = shown.points;
  const path = !shown.moved && data.routedPath ? data.routedPath : roundedPointsToSvgPath(curvePoints, 16);
  const midPlace = placeOnCurve(curvePoints, T, 0);
  // The edit control, and the dots, sit on the line's middle.
  const mid: Point = { x: midPlace.x, y: midPlace.y };
  // A text label and the badges under it go where the layout made room for the label.
  const labelAt: Point = showTextLabels && shown.labelAnchor ? shown.labelAnchor : mid;
  let currentOffset = startOffset;
  const displacements = labelItems.map((item) => {
    const d = placeOnCurve(curvePoints, T, currentOffset + item.width / 2);
    currentOffset += item.width + 2;
    return d;
  });
  // What sits at the line's middle, for the badges and the `//` to keep clear of.
  const slashObstacle: SlashObstacle | undefined =
    dots.length === 0
      ? undefined
      : showTextLabels
        ? { half: labelWidth / 2, at: labelAt }
        : { half: totalLabelWidth / 2 };
  const badges = violationBadges(data, curvePoints, slashObstacle ?? { half: 0 });
  drawnBadges.current = badges.map((b) => ({ ...b, dim: !incidentFocus }));

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

        {/* EP start marker: circle centered on border + filled arrow pointing into source. */}
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
        onMouseEnter={onEdgeEnter}
        onMouseLeave={onEdgeLeave}
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
      {negated && <NegationSlashes d={path} obstacle={slashObstacle} opacity={opacity} />}

      <EdgeLabelRenderer>
        {edit && (
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y - 10}px)`,
              pointerEvents: "all",
              opacity,
              zIndex: 12,
            }}
            className="nodrag nopan"
            onMouseEnter={onEdgeEnter}
            onMouseLeave={onEdgeLeave}
          >
            {data.pair ? (
              <MergedEdgeEditControl pair={data.pair} showPencil={edgeHovered} />
            ) : (
              <EdgeEditControl edgeId={rawId} showPencil={edgeHovered} />
            )}
          </div>
        )}
        {cardText && (
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelAt.x}px, ${labelAt.y + 16}px)`,
              pointerEvents: "none",
              opacity,
              zIndex: 9,
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 10,
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            <span
              style={{
                color: "var(--gray-12)",
                background: "var(--color-panel-solid, #fff)",
                border: "1px solid var(--gray-6)",
                borderRadius: 4,
                padding: "0 4px",
                lineHeight: "15px",
              }}
            >
              {cardText}
            </span>
          </div>
        )}
        {badges.map((b) => (
          <div
            key={b.title}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${b.x}px, ${b.y}px)`,
              pointerEvents: "none",
              opacity,
              zIndex: 11,
            }}
          >
            <span style={violationBadgeStyle(b)} title={b.title}>
              {b.text}
            </span>
          </div>
        ))}
        {!showTextLabels &&
          dots.map((dot, i) => {
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
        {showTextLabels && dots.length > 0 && (
          <div
            ref={measureLabel}
            onContextMenu={handleContextMenu}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelAt.x}px, ${labelAt.y}px)`,
              pointerEvents: "all",
              opacity,
              zIndex: 10,
              cursor: "context-menu",
              fontSize: 10,
              fontWeight: 600,
              lineHeight: "15px",
              whiteSpace: "nowrap",
              padding: "0 4px",
              borderRadius: 4,
              background: "var(--color-panel-solid, #fff)",
              border: "1px solid var(--gray-6)",
            }}
          >
            <ObjectTextNotation
              label={textLabel}
              objectTypeColor={objectTypeColor}
              hiddenObjectTypes={hiddenObjectTypes}
            />
          </div>
        )}
      </EdgeLabelRenderer>

      {/* Floating context card: portaled to document body so ReactFlow's viewport transform doesn't affect it. */}
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
              <span style={{ color: activityColor(sourceLabel) }}>{sourceLabel}</span>
              <span className="text-[var(--gray-8)]">→</span>
              <span style={{ color: activityColor(targetLabel) }}>{targetLabel}</span>
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
                sourceLabel,
                targetLabel,
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

/** OCPQ-style text notation: `∀ each ALL(all) ANY(any)`, O2O rendered lossless as `first>second`/`first<second`. */
function ObjectTextNotation({
  label,
  objectTypeColor,
  hiddenObjectTypes,
}: {
  label: OCDeclareArcLabel;
  objectTypeColor: ColorResolver;
  hiddenObjectTypes: Set<string>;
}) {
  const assoc = (a: ObjectTypeAssociation, i: number) => {
    if (a.type === "Simple") {
      return (
        <span key={`s-${a.object_type}-${i}`} style={{ color: objectTypeColor(a.object_type) }}>
          {a.object_type}
        </span>
      );
    }
    return (
      <span key={`o-${a.first}-${a.second}-${i}`}>
        <span style={{ color: objectTypeColor(a.first) }}>{a.first}</span>
        {a.reversed ? "<" : ">"}
        <span style={{ color: objectTypeColor(a.second) }}>{a.second}</span>
      </span>
    );
  };
  const list = (as: ObjectTypeAssociation[]) =>
    as
      .filter((a) => a.type !== "Simple" || !hiddenObjectTypes.has(a.object_type))
      .flatMap((a, i) => (i === 0 ? [assoc(a, i)] : [", ", assoc(a, i)]));

  const each = list(label.each);
  const all = list(label.all);
  const any = list(label.any);

  return (
    <span className="flex items-center gap-1">
      {each.length > 0 && <span>∀ {each}</span>}
      {all.length > 0 && (
        <span>
          <span className="font-semibold">ALL(</span>
          {all}
          <span className="font-semibold">)</span>
        </span>
      )}
      {any.length > 0 && (
        <span>
          <span className="font-semibold">ANY(</span>
          {any}
          <span className="font-semibold">)</span>
        </span>
      )}
    </span>
  );
}
