/**
 * Standalone SVG renderer for DFG-style panels. Produces a
 * self-contained SVG string with no foreignObject and no external CSS,
 * suitable for .svg export and PNG rasterization.
 *
 * The input shape intentionally decouples the renderer from ReactFlow so any
 * panel can build it from its own state. Callers pass the laid-out node
 * positions + sizes and the edge metadata (color, count, per-pair parallel
 * index); this file owns the actual drawing.
 */

import { getBezierPath, Position } from "@xyflow/react";
import {
  type DfgArc,
  type DfgMetric,
  computeMetricValue,
  formatMetricValue,
  isPerformanceMetric,
} from "./dfg-model";
import { durationColor } from "./duration";
import { exportBackgroundHex, flattenColor } from "./colors";

export const SVG_NS = "http://www.w3.org/2000/svg";

export function svgEl(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** Serialize an `<svg>` element to a standalone XML string. */
export function serializeSvg(svg: SVGSVGElement): string {
  return new XMLSerializer().serializeToString(svg);
}

/** Darken a `#rrggbb` color by a fraction (0..1). Returns `rgb(...)`. */
export function darken(hex: string, amount = 0.35): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return hex;
  const r = Math.round(parseInt(c.slice(0, 2), 16) * (1 - amount));
  const g = Math.round(parseInt(c.slice(2, 4), 16) * (1 - amount));
  const b = Math.round(parseInt(c.slice(4, 6), 16) * (1 - amount));
  return `rgb(${r},${g},${b})`;
}

/** Browser-side download of a Blob with a given filename. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Download an SVG string as a .svg file. */
export function downloadSvgString(svg: string, filename: string): void {
  downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), filename);
}

/** Rasterize an SVG string into a PNG Blob via a hidden <canvas>. */
export function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas 2d context unavailable"));
        return;
      }
      const dark =
        document.documentElement.classList.contains("dark") ||
        document.documentElement.getAttribute("data-theme") === "dark" ||
        document.querySelector(".radix-themes")?.classList.contains("dark") === true;
      const probe = document.querySelector(".radix-themes") ?? document.documentElement;
      ctx.fillStyle =
        getComputedStyle(probe).getPropertyValue("--color-background").trim() ||
        (dark ? "#111113" : "#ffffff");
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) resolve(blob);
        else reject(new Error("canvas toBlob returned null"));
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG image failed to load"));
    };
    img.src = url;
  });
}

/** Download an SVG string as a PNG file (rasterized client-side). */
export async function downloadSvgAsPng(svg: string, filename: string, scale = 2): Promise<void> {
  const blob = await svgToPngBlob(svg, scale);
  downloadBlob(blob, filename);
}

/** Render an SVG string to a PNG and return the raw byte array. */
export async function svgToPngBytes(svg: string, scale = 2): Promise<Uint8Array> {
  const blob = await svgToPngBlob(svg, scale);
  return new Uint8Array(await blob.arrayBuffer());
}

/** One node the renderer knows how to draw. `x` and `y` are the top-left
 *  of the node in the final coordinate system (post-layout). */
export interface DfgSvgNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Visible label. For terminals this can be the empty string. */
  label: string;
  /** Secondary line under the label (usually the frequency count). */
  sublabel?: string;
  /** Fill / stroke color base; activity-color-like. */
  color: string;
  /** Foreground color for the label text. */
  foreground?: string;
  /** Draw a rounded pill (activity) or a circular terminal. */
  shape?: "rect" | "terminal";
  /** For `terminal` shape: which inner symbol to draw. */
  terminalKind?: "start" | "end";
}

/** One edge the renderer draws. */
export interface DfgSvgEdge {
  key: string;
  source: string;
  target: string;
  label: string;
  color: string;
  strokeWidth?: number;
  parallelIndex?: number;
  parallelCount?: number;
  routing?: {
    points: { x: number; y: number }[];
    srcPos: { x: number; y: number };
    tgtPos: { x: number; y: number };
  };
}

export interface DfgSvgExportOptions {
  nodes: DfgSvgNode[];
  edges: DfgSvgEdge[];
  legend?: { title: string; items: { label: string; color: string; hideDot?: boolean }[] }[];
}

// Perpendicular offset between parallel edges sharing the same (source, target).
const PARALLEL_SPACING = 12;

type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

function ptInRect(p: Pt, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function cubicPt(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function splitCubicRight(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): [Pt, Pt, Pt, Pt] {
  const a = lerpPt(p0, p1, t);
  const b = lerpPt(p1, p2, t);
  const c = lerpPt(p2, p3, t);
  const d = lerpPt(a, b, t);
  const e = lerpPt(b, c, t);
  const f = lerpPt(d, e, t);
  return [f, e, c, p3];
}

function splitCubicLeft(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): [Pt, Pt, Pt, Pt] {
  const a = lerpPt(p0, p1, t);
  const b = lerpPt(p1, p2, t);
  const c = lerpPt(p2, p3, t);
  const d = lerpPt(a, b, t);
  const e = lerpPt(b, c, t);
  const f = lerpPt(d, e, t);
  return [p0, a, d, f];
}

/**
 * Clip a 1+3N cubic-spline point chain so endpoints land on the source /
 * target rectangle borders.
 */
function clipSplineToRects(pts: Pt[], srcRect: Rect | null, tgtRect: Rect | null, shortenEnd = 0): Pt[] {
  const isCubicChain = (pts.length - 1) % 3 === 0 && pts.length >= 4;
  const result = pts.map((p) => ({ ...p }));

  if (!isCubicChain) {
    if (shortenEnd > 0 && result.length >= 2) {
      const last = result[result.length - 1];
      const prev = result[result.length - 2];
      const dx = last.x - prev.x;
      const dy = last.y - prev.y;
      const len = Math.hypot(dx, dy);
      if (len > shortenEnd) {
        result[result.length - 1] = {
          x: last.x - (dx / len) * shortenEnd,
          y: last.y - (dy / len) * shortenEnd,
        };
      }
    }
    return result;
  }
  const STEPS = 20;

  if (srcRect && ptInRect(result[0], srcRect)) {
    const [p0, p1, p2, p3] = [result[0], result[1], result[2], result[3]];
    let exitT = -1;
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      if (!ptInRect(cubicPt(p0, p1, p2, p3, t), srcRect)) {
        exitT = t;
        break;
      }
    }
    if (exitT > 0) {
      let lo = exitT - 1 / STEPS,
        hi = exitT;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        if (ptInRect(cubicPt(p0, p1, p2, p3, mid), srcRect)) lo = mid;
        else hi = mid;
      }
      const [rp0, rp1, rp2, rp3] = splitCubicRight(p0, p1, p2, p3, hi);
      result[0] = rp0;
      result[1] = rp1;
      result[2] = rp2;
      result[3] = rp3;
    }
  }

  const n = result.length;
  if (tgtRect && ptInRect(result[n - 1], tgtRect)) {
    const [p0, p1, p2, p3] = [result[n - 4], result[n - 3], result[n - 2], result[n - 1]];
    let entryT = -1;
    for (let i = STEPS - 1; i >= 0; i--) {
      const t = i / STEPS;
      if (!ptInRect(cubicPt(p0, p1, p2, p3, t), tgtRect)) {
        entryT = t;
        break;
      }
    }
    if (entryT >= 0) {
      let lo = entryT,
        hi = entryT + 1 / STEPS;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        if (!ptInRect(cubicPt(p0, p1, p2, p3, mid), tgtRect)) lo = mid;
        else hi = mid;
      }
      const [lp0, lp1, lp2, lp3] = splitCubicLeft(p0, p1, p2, p3, lo);
      result[n - 4] = lp0;
      result[n - 3] = lp1;
      result[n - 2] = lp2;
      result[n - 1] = lp3;
    }
  }

  // Shorten the end so the stroke line is hidden under the arrow marker body.
  if (shortenEnd > 0 && result.length >= 2) {
    const last = result[result.length - 1];
    const prev = result[result.length - 2];
    const dx = last.x - prev.x;
    const dy = last.y - prev.y;
    const len = Math.hypot(dx, dy);
    if (len > shortenEnd) {
      result[result.length - 1] = {
        x: last.x - (dx / len) * shortenEnd,
        y: last.y - (dy / len) * shortenEnd,
      };
    }
  }

  return result;
}

// Render an ELK-routed point chain as an SVG path.
function splinePath(chain: Pt[]): string {
  if (chain.length === 0) return "";
  if (chain.length === 1) return `M ${chain[0].x},${chain[0].y}`;
  if ((chain.length - 1) % 3 === 0 && chain.length >= 4) {
    const parts: string[] = [`M ${chain[0].x},${chain[0].y}`];
    for (let i = 1; i + 2 < chain.length; i += 3) {
      parts.push(
        `C ${chain[i].x},${chain[i].y} ${chain[i + 1].x},${chain[i + 1].y} ${chain[i + 2].x},${chain[i + 2].y}`,
      );
    }
    return parts.join(" ");
  }
  if (chain.length === 2) {
    return `M ${chain[0].x},${chain[0].y} L ${chain[1].x},${chain[1].y}`;
  }
  const tension = 1;
  const parts: string[] = [`M ${chain[0].x},${chain[0].y}`];
  for (let i = 0; i < chain.length - 1; i++) {
    const p0 = i === 0 ? chain[0] : chain[i - 1];
    const p1 = chain[i];
    const p2 = chain[i + 1];
    const p3 = i + 2 < chain.length ? chain[i + 2] : chain[i + 1];
    const c1x = p1.x + ((p2.x - p0.x) * tension) / 6;
    const c1y = p1.y + ((p2.y - p0.y) * tension) / 6;
    const c2x = p2.x - ((p3.x - p1.x) * tension) / 6;
    const c2y = p2.y - ((p3.y - p1.y) * tension) / 6;
    parts.push(`C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`);
  }
  return parts.join(" ");
}

function buildEdgePath(
  src: DfgSvgNode,
  tgt: DfgSvgNode,
  parallelIndex: number,
  strokeWidth: number,
  parallelCount: number,
  routing: DfgSvgEdge["routing"],
): { d: string; midX: number; midY: number } {
  // Self-loop: arc out to the right of the node and back in.
  if (src.id === tgt.id) {
    const loopW = 36 + parallelIndex * 24;
    const mSize = Math.max(14, strokeWidth * 4);
    const arrowInset = mSize * 0.35;
    const startX = src.x + src.width;
    const startY = src.y + src.height * 0.3;
    const endX = src.x + src.width + arrowInset;
    const endY = src.y + src.height * 0.7;
    const d = `M ${startX},${startY} C ${startX + loopW},${startY - 4} ${endX + loopW},${endY + 4} ${endX},${endY}`;
    const midX = startX + loopW * 0.75;
    const midY = (startY + endY) / 2;
    return { d, midX, midY };
  }

  if (routing && routing.points.length >= 2) {
    const pts: Pt[] = routing.points.map((p) => ({ x: p.x, y: p.y }));
    const isCubicChain = (pts.length - 1) % 3 === 0 && pts.length >= 4;

    const srcDx = src.x - routing.srcPos.x;
    const srcDy = src.y - routing.srcPos.y;
    const tgtDx = tgt.x - routing.tgtPos.x;
    const tgtDy = tgt.y - routing.tgtPos.y;
    if (srcDx !== 0 || srcDy !== 0) {
      pts[0] = { x: pts[0].x + srcDx, y: pts[0].y + srcDy };
      if (isCubicChain && pts.length >= 2) {
        pts[1] = { x: pts[1].x + srcDx, y: pts[1].y + srcDy };
      }
    }
    if (tgtDx !== 0 || tgtDy !== 0) {
      const n = pts.length;
      pts[n - 1] = { x: pts[n - 1].x + tgtDx, y: pts[n - 1].y + tgtDy };
      if (isCubicChain && pts.length >= 2) {
        pts[n - 2] = { x: pts[n - 2].x + tgtDx, y: pts[n - 2].y + tgtDy };
      }
    }

    const halfSw = strokeWidth / 2;
    const srcRect: Rect = { x: src.x, y: src.y, w: src.width, h: src.height };
    const tgtRect: Rect = {
      x: tgt.x - halfSw,
      y: tgt.y - halfSw,
      w: tgt.width + strokeWidth,
      h: tgt.height + strokeWidth,
    };
    const mSize = Math.max(14, strokeWidth * 4);
    const shortenEnd = Math.max(0, 0.35 * mSize - halfSw);
    const clipped = clipSplineToRects(pts, srcRect, tgtRect, shortenEnd);
    for (let i = 0; i < pts.length; i++) pts[i] = clipped[i];

    const d = splinePath(pts);

    const anchors = isCubicChain ? pts.filter((_, i) => i % 3 === 0) : pts;
    let total = 0;
    const segs: number[] = [];
    for (let i = 1; i < anchors.length; i++) {
      const ddx = anchors[i].x - anchors[i - 1].x;
      const ddy = anchors[i].y - anchors[i - 1].y;
      const len = Math.sqrt(ddx * ddx + ddy * ddy);
      segs.push(len);
      total += len;
    }
    let acc = 0;
    let midX = anchors[anchors.length - 1].x;
    let midY = anchors[anchors.length - 1].y;
    for (let i = 0; i < segs.length; i++) {
      if (acc + segs[i] >= total / 2) {
        const t = segs[i] === 0 ? 0 : (total / 2 - acc) / segs[i];
        midX = anchors[i].x + (anchors[i + 1].x - anchors[i].x) * t;
        midY = anchors[i].y + (anchors[i + 1].y - anchors[i].y) * t;
        break;
      }
      acc += segs[i];
    }
    return { d, midX, midY };
  }

  // Fallback: parallel-offset bezier between bottom/top handles.
  const sourceX = src.x + src.width / 2;
  const sourceY = src.y + src.height;
  const targetX = tgt.x + tgt.width / 2;
  const targetY = tgt.y;

  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const magnitude = (parallelIndex - (parallelCount - 1) / 2) * PARALLEL_SPACING;
  const sx = sourceX + nx * magnitude;
  const sy = sourceY + ny * magnitude;
  const tx = targetX + nx * magnitude;
  const ty = targetY + ny * magnitude;

  const [d, labelX, labelY] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: Position.Bottom,
    targetX: tx,
    targetY: ty,
    targetPosition: Position.Top,
  });
  return { d, midX: labelX, midY: labelY };
}

export function buildDfgSvg(opts: DfgSvgExportOptions): string | null {
  const { nodes, edges, legend = [] } = opts;
  if (nodes.length === 0) return null;

  // Composite every translucent fill over the export background so the .svg carries only solid
  // 6-digit hex (8-digit hex / rgba render as black in some programs).
  const bgHex = exportBackgroundHex();

  const selfLoopMaxW = new Map<string, number>();
  for (const e of edges) {
    if (e.source === e.target) {
      const w = 36 + (e.parallelIndex ?? 0) * 24;
      const prev = selfLoopMaxW.get(e.source) ?? 0;
      if (w > prev) selfLoopMaxW.set(e.source, w);
    }
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    const loopExtra = selfLoopMaxW.get(n.id) ?? 0;
    maxX = Math.max(maxX, n.x + n.width + loopExtra);
    maxY = Math.max(maxY, n.y + n.height);
  }
  const padding = 40;
  const legendRowHeight = 22;
  const legendHeight = legend.length > 0 ? legend.length * legendRowHeight + 16 : 0;
  let vbX = minX - padding;
  let vbY = minY - padding;
  let width = maxX - minX + 2 * padding;
  let height = maxY - minY + 2 * padding + legendHeight;
  const MIN_ASPECT = 0.55;
  const MAX_ASPECT = 1.3;
  const aspect = height / width;
  if (aspect > MAX_ASPECT) {
    const targetWidth = height / MAX_ASPECT;
    const extraPerSide = (targetWidth - width) / 2;
    vbX -= extraPerSide;
    width = targetWidth;
  } else if (aspect < MIN_ASPECT) {
    const targetHeight = width * MIN_ASPECT;
    const extraPerSide = (targetHeight - height) / 2;
    vbY -= extraPerSide;
    height = targetHeight;
  }

  const svg = svgEl("svg", {
    xmlns: SVG_NS,
    viewBox: `${vbX} ${vbY} ${width} ${height}`,
    width,
    height,
  }) as SVGSVGElement;
  svg.setAttribute("font-family", "Inter, system-ui, -apple-system, sans-serif");

  const defs = svgEl("defs");
  svg.appendChild(defs);

  const edgesG = svgEl("g", { id: "edges" });
  const labelsG = svgEl("g", { id: "edge-labels" });
  const nodesG = svgEl("g", { id: "nodes" });
  svg.appendChild(edgesG);
  svg.appendChild(labelsG);
  svg.appendChild(nodesG);

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const markerIds = new Map<string, string>();
  const getMarkerId = (color: string, strokeWidth: number): string => {
    const key = `${color}__${strokeWidth.toFixed(1)}`;
    const existing = markerIds.get(key);
    if (existing) return existing;
    const id = `mk-arrow-${markerIds.size}`;
    markerIds.set(key, id);
    const markerSize = Math.max(14, strokeWidth * 4);
    const mk = svgEl("marker", {
      id,
      markerWidth: markerSize,
      markerHeight: markerSize,
      viewBox: "0 0 20 20",
      orient: "auto",
      refX: 7,
      refY: 10,
      markerUnits: "userSpaceOnUse",
    });
    mk.appendChild(
      svgEl("path", {
        d: "M 0,2 L 14,10 L 0,18 Z",
        fill: color,
        stroke: color,
        "stroke-width": 1.5,
        "stroke-linejoin": "round",
      }),
    );
    defs.appendChild(mk);
    return id;
  };

  const LABEL_PAD = 3;
  const LABEL_CHAR_W = 7;
  const LABEL_H = 14;
  interface ComputedEdge {
    d: string;
    color: string;
    strokeWidth: number;
    label: string;
    labelX: number;
    labelY: number;
    labelW: number;
    anchored: boolean;
  }
  const computed: ComputedEdge[] = [];
  for (const edge of edges) {
    const src = nodeById.get(edge.source);
    const tgt = nodeById.get(edge.target);
    if (!src || !tgt) continue;
    const edgeSw = edge.strokeWidth ?? 2;
    const { d, midX, midY } = buildEdgePath(
      src,
      tgt,
      edge.parallelIndex ?? 0,
      edgeSw,
      edge.parallelCount ?? 1,
      edge.routing,
    );
    const labelW = edge.label ? edge.label.length * LABEL_CHAR_W + LABEL_PAD * 2 : 0;
    computed.push({
      d,
      color: edge.color,
      strokeWidth: edge.strokeWidth ?? 2,
      label: edge.label,
      labelX: midX,
      labelY: midY,
      labelW,
      anchored: edge.source === edge.target,
    });
  }

  const placed: { x: number; y: number; w: number; h: number }[] = [];

  for (const ce of computed) {
    if (!ce.label || !ce.anchored) continue;
    placed.push({ x: ce.labelX, y: ce.labelY, w: ce.labelW, h: LABEL_H });
  }

  for (const ce of computed) {
    if (!ce.label || ce.anchored) continue;
    const w = ce.labelW;
    const lx = ce.labelX;
    let ly = ce.labelY;
    for (let iter = 0; iter < 12; iter++) {
      let overlap = false;
      for (const p of placed) {
        if (Math.abs(lx - p.x) < (w + p.w) / 2 + 2 && Math.abs(ly - p.y) < (LABEL_H + p.h) / 2 + 1) {
          overlap = true;
          ly += ly >= p.y ? LABEL_H + 2 : -(LABEL_H + 2);
          break;
        }
      }
      if (!overlap) break;
    }
    ce.labelX = lx;
    ce.labelY = ly;
    placed.push({ x: lx, y: ly, w, h: LABEL_H });
  }

  for (const ce of computed) {
    const markerId = getMarkerId(ce.color, ce.strokeWidth);
    edgesG.appendChild(
      svgEl("path", {
        d: ce.d,
        fill: "none",
        stroke: ce.color,
        "stroke-width": ce.strokeWidth,
        "marker-end": `url(#${markerId})`,
      }),
    );
    if (ce.label) {
      labelsG.appendChild(
        svgEl("rect", {
          x: ce.labelX - ce.labelW / 2,
          y: ce.labelY - LABEL_H / 2,
          width: ce.labelW,
          height: LABEL_H,
          rx: 3,
          ry: 3,
          fill: flattenColor("#ffffffcc", bgHex),
        }),
      );
      const t = svgEl("text", {
        x: ce.labelX,
        y: ce.labelY + 1,
        "text-anchor": "middle",
        "dominant-baseline": "central",
        "font-size": 10,
        "font-weight": 600,
        fill: ce.color,
      });
      t.textContent = ce.label;
      labelsG.appendChild(t);
    }
  }

  for (const n of nodes) {
    const g = svgEl("g", { transform: `translate(${n.x}, ${n.y})` });
    if (n.shape === "terminal") {
      const cx = n.width / 2;
      const cy = n.height / 2;
      const r = Math.min(n.width, n.height) / 2 - 2;
      g.appendChild(svgEl("circle", { cx, cy, r, fill: n.color }));
      if (n.terminalKind === "start") {
        const halfW = r * 0.28;
        const halfH = r * 0.32;
        g.appendChild(
          svgEl("polygon", {
            points: `${cx - halfW},${cy - halfH} ${cx - halfW},${cy + halfH} ${cx + halfW},${cy}`,
            fill: "#ffffff",
          }),
        );
      } else if (n.terminalKind === "end") {
        const side = r * 0.7;
        g.appendChild(
          svgEl("rect", {
            x: cx - side / 2,
            y: cy - side / 2,
            width: side,
            height: side,
            rx: 1,
            ry: 1,
            fill: "#ffffff",
          }),
        );
      }
    } else {
      const bg = flattenColor(
        n.color.length === 7 && n.color.startsWith("#") ? `${n.color}26` : n.color,
        bgHex,
      );
      g.appendChild(
        svgEl("rect", {
          x: 0,
          y: 0,
          width: n.width,
          height: n.height,
          rx: 10,
          ry: 10,
          fill: bg,
          stroke: n.color,
          "stroke-width": 2,
        }),
      );
      const fg = n.foreground ?? darken(n.color, 0.55);
      const labelCy = n.sublabel ? n.height / 2 - 6 : n.height / 2;
      const labelT = svgEl("text", {
        x: n.width / 2,
        y: labelCy,
        "text-anchor": "middle",
        "dominant-baseline": "central",
        "font-size": 12,
        "font-weight": 600,
        fill: fg,
      });
      const maxChars = Math.max(8, Math.floor(n.width / 9));
      const truncated = n.label.length > maxChars ? `${n.label.slice(0, maxChars - 1).trimEnd()}…` : n.label;
      labelT.textContent = truncated;
      g.appendChild(labelT);
      if (n.sublabel) {
        const subT = svgEl("text", {
          x: n.width / 2,
          y: n.height / 2 + 8,
          "text-anchor": "middle",
          "dominant-baseline": "central",
          "font-size": 10,
          fill: fg,
          opacity: 0.8,
        });
        subT.textContent = n.sublabel;
        g.appendChild(subT);
      }
    }
    nodesG.appendChild(g);
  }

  if (legend.length > 0) {
    const legendTop = maxY + padding * 0.6;
    const legendG = svgEl("g", { id: "legend", transform: `translate(${vbX + padding}, ${legendTop})` });
    svg.appendChild(legendG);
    for (let row = 0; row < legend.length; row++) {
      const { title, items } = legend[row];
      const y = row * legendRowHeight;
      const titleT = svgEl("text", {
        x: 0,
        y,
        "font-size": 11,
        "font-weight": 700,
        "letter-spacing": "0.05em",
        fill: "#1f2937",
        "dominant-baseline": "central",
      });
      titleT.textContent = title.toUpperCase();
      legendG.appendChild(titleT);
      let cursor = 100;
      for (const item of items) {
        if (!item.hideDot) {
          legendG.appendChild(svgEl("circle", { cx: cursor, cy: y, r: 4.5, fill: item.color }));
        }
        const textOffset = item.hideDot ? 0 : 9;
        const t = svgEl("text", {
          x: cursor + textOffset,
          y,
          "font-size": 11,
          fill: item.hideDot ? "#374151" : item.color,
          "dominant-baseline": "central",
        });
        t.textContent = item.label;
        legendG.appendChild(t);
        cursor += item.label.length * 6.4 + (item.hideDot ? 10 : 22);
      }
    }
  }

  return serializeSvg(svg);
}

/** Minimal layouted node shape pulled from ReactFlow's `getNodes()`. */
export interface LayoutedNodeLite {
  id: string;
  position: { x: number; y: number };
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
}

export interface DfgSvgBuilderInputs {
  layoutedNodes: LayoutedNodeLite[];
  filteredArcs: DfgArc[];
  activityCounts: Record<string, number>;
  activityColor: (name: string) => string;
  formatDuration?: (ms: number) => string;
  metric?: DfgMetric;
  /** Recolor edges with the duration heatmap (case-centric, performance metric). */
  heatmap?: boolean;
  legend?: { title: string; items: { label: string; color: string; hideDot?: boolean }[] }[];
}

/** Convert a live DFG panel's state into a `DfgSvgExportOptions` payload and
 *  call `buildDfgSvg`. */
export function buildDfgSvgFromPanel(inputs: DfgSvgBuilderInputs): string | null {
  const {
    layoutedNodes,
    filteredArcs,
    activityCounts,
    activityColor,
    formatDuration,
    metric: inputMetric,
    heatmap,
    legend,
  } = inputs;
  const metric = inputMetric ?? "count";

  const touched = new Set<string>();
  for (const a of filteredArcs) {
    touched.add(a.from);
    touched.add(a.to);
  }
  const nodeSvgs: DfgSvgNode[] = [];
  for (const n of layoutedNodes) {
    if (!touched.has(n.id)) continue;
    const width = n.measured?.width ?? n.width ?? 160;
    const height = n.measured?.height ?? n.height ?? 50;
    const isTerminal = n.id === "__START" || n.id === "__END";
    if (isTerminal) {
      const isStart = n.id === "__START";
      nodeSvgs.push({
        id: n.id,
        x: n.position.x,
        y: n.position.y,
        width,
        height,
        label: "",
        color: isStart ? "#a855f7" : "#ef4444",
        shape: "terminal",
        terminalKind: isStart ? "start" : "end",
      });
    } else {
      nodeSvgs.push({
        id: n.id,
        x: n.position.x,
        y: n.position.y,
        width,
        height,
        label: n.id,
        sublabel: (activityCounts[n.id] ?? 0).toLocaleString("en"),
        color: activityColor(n.id),
        shape: "rect",
      });
    }
  }

  const parallelCountByPair = new Map<string, number>();
  const parallelIndexByKey = new Map<string, number>();
  for (const a of filteredArcs) {
    const pair = `${a.from}\u0000${a.to}`;
    const idx = parallelCountByPair.get(pair) ?? 0;
    parallelIndexByKey.set(a.key, idx);
    parallelCountByPair.set(pair, idx + 1);
  }
  const metricValues = new Map<string, number>();
  for (const a of filteredArcs) {
    const val = computeMetricValue(a, metric, activityCounts);
    if (val != null) metricValues.set(a.key, val);
  }
  const allVals = [...metricValues.values()];
  const valMin = allVals.length > 0 ? Math.min(...allVals) : 0;
  const valMax = allVals.length > 0 ? Math.max(...allVals) : 1;
  const isPerf = isPerformanceMetric(metric);
  const maxCount = Math.max(1, ...filteredArcs.map((a) => a.count));

  const edgeSvgs: DfgSvgEdge[] = filteredArcs.map((a) => {
    const val = metricValues.get(a.key);
    const label = val != null ? formatMetricValue(val, metric, formatDuration) : "";
    let strokeWidth: number;
    if (a.strokeWidth != null) {
      strokeWidth = a.strokeWidth;
    } else if (val != null) {
      if (isPerf || metric === "pct_source") {
        const t = valMax > valMin ? (val - valMin) / (valMax - valMin) : 0.5;
        strokeWidth = 1.5 + 4.5 * Math.sqrt(t);
      } else {
        strokeWidth = Math.min(6, 1 + Math.log2(1 + (6 * a.count) / maxCount));
      }
    } else {
      strokeWidth = 1.5;
    }
    let color = a.color ?? "#9ca3af";
    if (heatmap && isPerf && a.duration != null && val != null) {
      const t = valMax > valMin ? (val - valMin) / (valMax - valMin) : 0.5;
      color = durationColor(t);
    }
    return {
      key: a.key,
      source: a.from,
      target: a.to,
      label,
      color,
      strokeWidth,
      parallelIndex: parallelIndexByKey.get(a.key) ?? 0,
      parallelCount: parallelCountByPair.get(`${a.from}\u0000${a.to}`) ?? 1,
      routing: a.routing,
    };
  });

  return buildDfgSvg({ nodes: nodeSvgs, edges: edgeSvgs, legend });
}

/** Convenience: build + download as .svg. */
export function downloadDfgSvg(inputs: DfgSvgBuilderInputs, filename: string): void {
  const svg = buildDfgSvgFromPanel(inputs);
  if (svg) downloadSvgString(svg, filename);
}

/** Convenience: build + rasterize + download as .png. */
export async function downloadDfgPng(
  inputs: DfgSvgBuilderInputs,
  filename: string,
  scale = 2,
): Promise<void> {
  const svg = buildDfgSvgFromPanel(inputs);
  if (svg) await downloadSvgAsPng(svg, filename, scale);
}

/** Convenience: build + rasterize, returning the raw PNG bytes. */
export async function buildDfgPngBytes(inputs: DfgSvgBuilderInputs, scale = 2): Promise<Uint8Array | null> {
  const svg = buildDfgSvgFromPanel(inputs);
  if (!svg) return null;
  return svgToPngBytes(svg, scale);
}
