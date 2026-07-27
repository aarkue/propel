import { polylinePointAt } from "../graph-edit/routing";
import type { StyledEdge, StyledGraph, StyledNode } from "./styled-graph";

/** Backend-free `StyledGraphRenderer`: draws a {@link StyledGraph} to a standalone SVG string for the ELK route (no markings/icons/legends). */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function nodeSvg(n: StyledNode): string {
  const x = n.cx - n.w / 2;
  const y = n.cy - n.h / 2;
  const radius = n.shape?.kind === "box" ? Math.min(n.shape.radius ?? 0, n.h / 2) : n.h / 2;
  const isEllipse = n.shape?.kind === "ellipse" || n.shape?.kind === "circle";
  const shape = isEllipse
    ? `<ellipse cx="${n.cx}" cy="${n.cy}" rx="${n.w / 2}" ry="${n.h / 2}" fill="${n.fill ?? "none"}" stroke="${n.stroke ?? "none"}" stroke-width="${n.stroke_width ?? 1}"${n.stroke_dash ? ` stroke-dasharray="${n.stroke_dash}"` : ""} />`
    : `<rect x="${x}" y="${y}" width="${n.w}" height="${n.h}" rx="${radius}" fill="${n.fill ?? "none"}" stroke="${n.stroke ?? "none"}" stroke-width="${n.stroke_width ?? 1}"${n.stroke_dash ? ` stroke-dasharray="${n.stroke_dash}"` : ""} />`;
  const labels = (n.labels ?? [])
    .map(
      (l) =>
        `<text x="${n.cx}" y="${n.cy + (l.dy ?? 0)}" text-anchor="middle" dominant-baseline="central" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${l.size ?? 12}" font-weight="${l.weight ?? 400}" fill="${l.color ?? "#000"}">${esc(l.text)}</text>`,
    )
    .join("");
  return shape + labels;
}

function edgeSvg(e: StyledEdge, markerId: string): string {
  if (e.points.length < 2) return "";
  const d = e.points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const color = e.color ?? "#888";
  const end =
    e.marker_end === "arrow" || e.marker_end === "arrow_ball" ? ` marker-end="url(#${markerId})"` : "";
  const line = `<path d="${d}" fill="none" stroke="${color}" stroke-width="${e.width ?? 1.5}"${e.dash ? ` stroke-dasharray="${e.dash}"` : ""} stroke-linejoin="round"${end} />`;
  const labels = (e.labels ?? [])
    .map((l) => {
      const { x: lx, y: ly } = polylinePointAt(
        e.points.map(([x, y]) => ({ x, y })),
        l.at ?? 0.5,
      );
      const cx = lx + (l.dx ?? 0);
      const cy = ly + (l.dy ?? 0) - 5;
      const halo = l.bg
        ? `<text x="${cx}" y="${cy}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="9" stroke="${l.bg}" stroke-width="3" paint-order="stroke" fill="${l.color ?? color}">${esc(l.text)}</text>`
        : "";
      return `${halo}<text x="${cx}" y="${cy}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="9" fill="${l.color ?? color}">${esc(l.text)}</text>`;
    })
    .join("");
  return line + labels;
}

/** Render a `StyledGraph` to a standalone SVG document string. */
export function styledGraphToSvg(graph: StyledGraph): string {
  const pad = graph.padding ?? 24;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const n of graph.nodes) {
    xs.push(n.cx - n.w / 2, n.cx + n.w / 2);
    ys.push(n.cy - n.h / 2, n.cy + n.h / 2);
  }
  for (const e of graph.edges)
    for (const [x, y] of e.points) {
      xs.push(x);
      ys.push(y);
    }
  if (xs.length === 0) return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"></svg>`;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const h = Math.max(...ys) - Math.min(...ys) + pad * 2;

  // One arrow marker per edge color so each arrowhead matches its edge.
  const colors = [
    ...new Set(graph.edges.filter((e) => e.marker_end?.includes("arrow")).map((e) => e.color ?? "#888")),
  ];
  const markerId = (c: string) => `sg-arrow-${colors.indexOf(c)}`;
  const markers = colors
    .map(
      (c) =>
        `<marker id="${markerId(c)}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0.5 L9,3.5 L0,6.5" fill="none" stroke="${c}" stroke-width="1.2" stroke-linejoin="round" /></marker>`,
    )
    .join("");

  const bg = graph.background
    ? `<rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="${graph.background}" />`
    : "";
  const edges = graph.edges.map((e) => edgeSvg(e, markerId(e.color ?? "#888"))).join("");
  const nodes = graph.nodes.map(nodeSvg).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${minX} ${minY} ${w} ${h}"><defs>${markers}</defs>${bg}${edges}${nodes}</svg>`;
}
