import type { Edge } from "@xyflow/react";
import type { ArcData, PetriNetNode } from "../Editor";
import { ARROW, arcGeometry, markerSizeFor } from "./edge-geometry";
import { PLACE_SIZE, TRANSITION_SIZE } from "./layout-graph";

/** Read colors from the live DOM at export time so exports match the active theme. */
function resolveThemeColors() {
  if (typeof document === "undefined") {
    return {
      nodeBg: "#ffffff",
      nodeBorder: "#1f2937",
      nodeText: "#111827",
      arcDefaultColor: "#374151",
      arcLabelBg: "rgba(255, 255, 255, 0.80)",
      exportBg: "#ffffff",
    };
  }
  const probe = document.querySelector(".radix-themes") ?? document.documentElement;
  const read = (name: string) => getComputedStyle(probe).getPropertyValue(name).trim();
  const dark =
    document.documentElement.classList.contains("dark") ||
    document.documentElement.getAttribute("data-theme") === "dark" ||
    (probe !== document.documentElement && probe.classList.contains("dark"));
  return {
    nodeBg: read("--color-panel-solid") || (dark ? "#19191b" : "#ffffff"),
    nodeBorder: read("--gray-8") || (dark ? "#5e5e6e" : "#1f2937"),
    nodeText: read("--gray-12") || (dark ? "#ededef" : "#111827"),
    arcDefaultColor: read("--gray-11") || (dark ? "#b0b0b8" : "#374151"),
    arcLabelBg: dark ? "rgba(25, 25, 27, 0.85)" : "rgba(255, 255, 255, 0.80)",
    exportBg: read("--color-background") || (dark ? "#111113" : "#ffffff"),
  };
}

const SVG_NS = "http://www.w3.org/2000/svg";

function el(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}
function text(content: string, attrs: Record<string, string | number>): SVGElement {
  const t = el("text", attrs);
  t.textContent = content;
  return t;
}

function px(v: unknown, fallback: number): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

/** Greedy word-wrap into at most `maxLines` lines of ~`maxChars`, ellipsizing overflow. */
function wrapLabel(label: string, maxChars: number, maxLines: number): string[] {
  if (!label) return [];
  const words = label.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines - 1) break;
    } else {
      cur = next;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines) {
    const remaining = words.slice(lines.join(" ").split(/\s+/).length).join(" ");
    let last = lines[maxLines - 1];
    if (remaining || last.length > maxChars) {
      last = `${last.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
      lines[maxLines - 1] = last;
    }
  }
  return lines;
}

const center = (n: PetriNetNode) => n.position;

/**
 * Serialize a laid-out Petri net to a standalone vector SVG string
 * (real circles / rects / paths: no foreignObject, no external CSS). Mirrors
 * the on-screen rendering via the shared {@link arcGeometry}. Custom
 * `renderMarking`/`renderContent` (arbitrary JSX) cannot be vectorized, so they
 * fall back to the default token dots / label.
 */
export function buildPetriNetSvg(nodes: PetriNetNode[], edges: Edge<ArcData>[]): string | null {
  if (nodes.length === 0) return null;
  const theme = resolveThemeColors();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const sizeOf = (n: PetriNetNode) => (n.type === "place" ? PLACE_SIZE : TRANSITION_SIZE);

  // bounds (node boxes; edge routing stays within node spans plus the gap)
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const s = sizeOf(n);
    minX = Math.min(minX, n.position.x - s.width / 2);
    minY = Math.min(minY, n.position.y - s.height / 2);
    maxX = Math.max(maxX, n.position.x + s.width / 2);
    maxY = Math.max(maxY, n.position.y + s.height / 2);
  }
  // Edge routing can bow past the node boxes, so include bend points so nothing clips.
  for (const e of edges) {
    for (const p of e.data?.routing?.points ?? []) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const pad = 36;
  const vbX = minX - pad;
  const vbY = minY - pad;
  const width = maxX - minX + 2 * pad;
  const height = maxY - minY + 2 * pad;

  const svg = el("svg", {
    xmlns: SVG_NS,
    viewBox: `${vbX} ${vbY} ${width} ${height}`,
    width,
    height,
  }) as SVGSVGElement;
  svg.setAttribute("font-family", "Inter, system-ui, -apple-system, sans-serif");

  const defs = el("defs");
  const edgesG = el("g", { id: "arcs" });
  const labelsG = el("g", { id: "arc-labels" });
  const nodesG = el("g", { id: "nodes" });
  svg.append(defs, edgesG, nodesG, labelsG);

  // shared arrow markers, keyed by (color, strokeWidth)
  const markerIds = new Map<string, string>();
  const markerFor = (color: string, sw: number): string => {
    const key = `${color}__${sw.toFixed(2)}`;
    const found = markerIds.get(key);
    if (found) return found;
    const id = `pn-mk-${markerIds.size}`;
    markerIds.set(key, id);
    const size = markerSizeFor(sw);
    const mk = el("marker", {
      id,
      markerWidth: size,
      markerHeight: size,
      viewBox: ARROW.viewBox,
      orient: "auto",
      refX: ARROW.refX,
      refY: ARROW.refY,
      markerUnits: "userSpaceOnUse",
    });
    mk.appendChild(el("path", { d: ARROW.path, fill: color, stroke: color, "stroke-linejoin": "round" }));
    defs.appendChild(mk);
    return id;
  };

  // Arcs.
  for (const e of edges) {
    const src = byId.get(e.source);
    const tgt = byId.get(e.target);
    if (!src || !tgt) continue;
    const es = (e.style ?? {}) as React.CSSProperties;
    const color = (es.stroke as string) ?? theme.arcDefaultColor;
    const sw = px(es.strokeWidth, 2);
    const dash = es.strokeDasharray;

    const { path, labelX, labelY } = arcGeometry({
      sourceCenter: center(src),
      targetCenter: center(tgt),
      sourceType: src.type,
      targetType: tgt.type,
      strokeWidth: sw,
      routing: e.data?.routing,
    });

    edgesG.appendChild(
      el("path", {
        d: path,
        fill: "none",
        stroke: color,
        "stroke-width": sw,
        "stroke-linecap": "butt",
        ...(dash ? { "stroke-dasharray": String(dash) } : {}),
        "marker-end": `url(#${markerFor(color, sw)})`,
      }),
    );

    const weight = e.data?.weight;
    const labelText = e.data?.label ?? (weight != null && weight !== 1 ? String(weight) : undefined);
    if (labelText) {
      const w = labelText.length * 6.2 + 6;
      labelsG.appendChild(
        el("rect", { x: labelX - w / 2, y: labelY - 8, width: w, height: 14, rx: 3, fill: theme.arcLabelBg }),
      );
      labelsG.appendChild(
        text(labelText, {
          x: labelX,
          y: labelY + 1,
          "text-anchor": "middle",
          "dominant-baseline": "central",
          "font-size": 10,
          "font-weight": 600,
          fill: color,
        }),
      );
    }
  }

  // Nodes.
  for (const n of nodes) {
    const s = sizeOf(n);
    const cx = n.position.x;
    const cy = n.position.y;
    const st = (n.data.style ?? {}) as React.CSSProperties;
    const opacity = px(st.opacity, 1);

    if (n.type === "place") {
      const stroke = (st.borderColor as string) ?? theme.nodeBorder;
      const fill = (st.background as string) ?? (st.backgroundColor as string) ?? theme.nodeBg;
      const strokeW = px(st.borderWidth, 1.75);
      const r = s.width / 2 - strokeW / 2;
      const g = el("g", opacity !== 1 ? { opacity } : {});
      g.appendChild(el("circle", { cx, cy, r, fill, stroke, "stroke-width": strokeW }));

      // Explicit per-token marks win (mirrors a DOM tokenMarks render, e.g. the
      // simulator's green final tokens); otherwise initial-marking tokens (round
      // dots) followed by final-marking tokens (faded squares).
      const marks = n.data.tokenMarks;
      if (marks && marks.length > 0) {
        const total = marks.length;
        const inner = s.width - 4 * strokeW;
        const dotD = Math.min(11, Math.max(4, inner / total - 2));
        const totalW = total * dotD + (total - 1) * 2;
        let dx = cx - totalW / 2 + dotD / 2;
        for (const m of marks) {
          const color = m.color ?? theme.nodeText;
          const op = m.opacity ?? 1;
          if (m.shape === "square") {
            const sq = dotD * 0.9;
            g.appendChild(
              el("rect", {
                x: dx - sq / 2,
                y: cy - sq / 2,
                width: sq,
                height: sq,
                rx: 2,
                fill: color,
                opacity: op,
              }),
            );
          } else {
            g.appendChild(el("circle", { cx: dx, cy, r: dotD / 2, fill: color, opacity: op }));
          }
          dx += dotD + 2;
        }
      } else {
        const count = n.data.tokens ?? 0;
        const finalCount = n.data.finalTokens ?? 0;
        const total = count + finalCount;
        if (total > 0) {
          const inner = s.width - 4 * strokeW;
          const dotD = Math.min(11, Math.max(4, inner / total - 2));
          const totalW = total * dotD + (total - 1) * 2;
          const tColor = n.data.tokenColor ?? theme.nodeText;
          let dx = cx - totalW / 2 + dotD / 2;
          for (let i = 0; i < count; i++) {
            g.appendChild(el("circle", { cx: dx, cy, r: dotD / 2, fill: tColor }));
            dx += dotD + 2;
          }
          for (let i = 0; i < finalCount; i++) {
            const sq = dotD * 0.9;
            g.appendChild(
              el("rect", {
                x: dx - sq / 2,
                y: cy - sq / 2,
                width: sq,
                height: sq,
                rx: 2,
                fill: tColor,
                opacity: 0.2,
              }),
            );
            dx += dotD + 2;
          }
        }
      }
      nodesG.appendChild(g);
    } else {
      const label = n.data.label ?? "";
      const invisible = label === "";
      const stroke = (st.borderColor as string) ?? theme.nodeBorder;
      const fill = invisible
        ? theme.nodeText
        : ((st.background as string) ?? (st.backgroundColor as string) ?? theme.nodeBg);
      const strokeW = px(st.borderWidth, 1.75);
      const g = el("g", opacity !== 1 ? { opacity } : {});
      g.appendChild(
        el("rect", {
          x: cx - s.width / 2,
          y: cy - s.height / 2,
          width: s.width,
          height: s.height,
          rx: 4,
          fill,
          stroke,
          "stroke-width": strokeW,
        }),
      );
      if (!invisible) {
        const textColor = (st.color as string) ?? theme.nodeText;
        const lines = wrapLabel(label, Math.max(6, Math.floor((s.width - 12) / 7)), 2);
        const lineH = 14;
        const y0 = cy - ((lines.length - 1) * lineH) / 2;
        lines.forEach((line, i) => {
          g.appendChild(
            text(line, {
              x: cx,
              y: y0 + i * lineH,
              "text-anchor": "middle",
              "dominant-baseline": "central",
              "font-size": 12.5,
              "font-weight": 500,
              fill: textColor,
            }),
          );
        });
      }
      nodesG.appendChild(g);
    }
  }

  return new XMLSerializer().serializeToString(svg);
}

// Download / rasterize (browser).

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadSvg(svg: string, filename: string): void {
  downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), filename);
}

/** Rasterize an SVG string to a PNG and download it. */
export function downloadSvgAsPng(svg: string, filename: string, scale = 2): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, img.naturalWidth * scale);
      canvas.height = Math.max(1, img.naturalHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas 2d context unavailable"));
        return;
      }
      ctx.fillStyle = resolveThemeColors().exportBg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) {
          downloadBlob(blob, filename);
          resolve();
        } else reject(new Error("canvas toBlob returned null"));
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG image failed to load"));
    };
    img.src = url;
  });
}
