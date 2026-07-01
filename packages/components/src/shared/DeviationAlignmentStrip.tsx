import { useMemo, type CSSProperties, type ReactNode } from "react";
import { colorToHex } from "../dfg/util/colors";
import { ActivityChip, SVG_PILL_H } from "./ActivitySequence";
import { svgEl, serializeSvg, SVG_NS } from "../dfg/util/svg-export";
import { useRegisterExport, type VectorExportSource } from "../viewer/export";
import {
  MOVE_COLOR,
  MoveGlyphIcon,
  svgChipWidth,
  svgMoveChip,
  svgMoveIcon,
  type MoveKind,
  type ResolvedMove,
} from "./TraceAlignmentStrip";

const SKIP_COLOR = "#9ca3af";
const AXIS_COLOR = "var(--gray-6, #d1d5db)";
const GUIDE_COLOR = "var(--gray-4, #e5e7eb)";
const PANEL_BG = "var(--color-panel-solid, Canvas)";

const AXIS_H = 12;
const REGION_H = 40; // chip + outer kind-icon

// Two shared background rails run the length of the strip: converged on the center axis under a sync
// move, split to the lane chips (up = log, down = model) under a deviation.
const COL_H = REGION_H * 2 + AXIS_H;
const CENTER_Y = REGION_H + AXIS_H / 2;
const RAIL_SPLIT = 17; // rise/fall from center so a split rail sits behind its lane chip
const RAIL_TOP_Y = CENTER_Y - RAIL_SPLIT;
const RAIL_BOT_Y = CENTER_Y + RAIL_SPLIT;
// Side padding so a chip never fills its column edge-to-edge; the rails stay visible in the gaps
// (a sync move otherwise fully covers the center line, hiding it).
const COL_PAD_X = 7;

const MOVE_ICON: Record<MoveKind, ReactNode> = {
  sync: <MoveGlyphIcon kind="sync" size={11} />,
  model: <MoveGlyphIcon kind="model" size={11} />,
  log: <MoveGlyphIcon kind="log" size={11} />,
};

function cellColor(move: ResolvedMove, colorOf?: (activity: string) => string): string {
  if (move.kind === "model" && move.hidden) return SKIP_COLOR;
  return colorOf?.(move.label) ?? colorToHex(MOVE_COLOR[move.kind]);
}

/**
 * One x-position in the trace. A `sync` move sits alone on the axis. A deviation
 * column carries a `log` move (deviating up) and/or a `model` move (deviating
 * down); an adjacent log+model pair shares one column as a substitution.
 */
interface Column {
  sync?: ResolvedMove;
  log?: ResolvedMove;
  model?: ResolvedMove;
}

/** Group the flat move list into columns, preserving order. Each adjacent log+model (in either
 *  order) collapses into one substitution column; every other move keeps its own column, so a run
 *  of model moves lays out horizontally in sequence. */
function toColumns(moves: ResolvedMove[]): Column[] {
  const cols: Column[] = [];
  let i = 0;
  while (i < moves.length) {
    const m = moves[i];
    const next = moves[i + 1];
    if (m.kind === "sync") {
      cols.push({ sync: m });
      i += 1;
    } else if (m.kind === "log") {
      if (next?.kind === "model") {
        cols.push({ log: m, model: next });
        i += 2;
      } else {
        cols.push({ log: m });
        i += 1;
      }
    } else {
      if (next?.kind === "log") {
        cols.push({ log: next, model: m });
        i += 2;
      } else {
        cols.push({ model: m });
        i += 1;
      }
    }
  }
  return cols;
}

/** A chip with its kind icon as a circular badge overlapping one edge of the chevron
 *  (`badge`: which edge the icon sits on). */
function MoveChip({
  move,
  colorOf,
  badge,
}: {
  move: ResolvedMove;
  colorOf?: (activity: string) => string;
  badge: "top" | "bottom";
}) {
  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <ActivityChip activity={move.label} color={cellColor(move, colorOf)} chain={false} />
      <span
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          [badge]: -8,
          display: "flex",
          lineHeight: 1,
          color: colorToHex(MOVE_COLOR[move.kind]),
          background: PANEL_BG,
          borderRadius: 9999,
          padding: 2,
          zIndex: 2,
        }}
      >
        {MOVE_ICON[move.kind]}
      </span>
    </div>
  );
}

/** A deviating chip hugging the axis, with the kind icon on the outer edge. */
function Lane({
  move,
  dir,
  colorOf,
}: {
  move: ResolvedMove;
  dir: "up" | "down";
  colorOf?: (activity: string) => string;
}) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: dir === "up" ? "flex-end" : "flex-start",
      }}
    >
      <MoveChip move={move} colorOf={colorOf} badge={dir === "up" ? "top" : "bottom"} />
    </div>
  );
}

/** Placeholder shown in the lane with no move, hugging the axis. */
function Skip({ dir }: { dir: "up" | "down" }) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: dir === "up" ? "flex-end" : "flex-start",
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: SKIP_COLOR,
          border: `1px dashed ${SKIP_COLOR}`,
          borderRadius: 5,
          padding: "0 4px",
          lineHeight: "14px",
        }}
      >
        {">>"}
      </span>
    </div>
  );
}

/** Faint left-side legend naming the two deviation lanes, aligned to the lane bands. */
function LaneLabels() {
  const text = (label: string, align: "flex-start" | "flex-end", border: "borderTop" | "borderBottom") => (
    <div
      style={{
        height: REGION_H,
        display: "flex",
        alignItems: align,
        justifyContent: "flex-start",
        paddingLeft: 2,
        paddingRight: 8,
        paddingBottom: align === "flex-start" ? 0 : 2,
        paddingTop: align === "flex-start" ? 2 : 0,
        [border]: `1px solid ${GUIDE_COLOR}`,
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--gray-8, #9ca3af)",
        }}
      >
        {label}
      </span>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch" }}>
      {text("log", "flex-start", "borderTop")}
      <div style={{ height: AXIS_H }} />
      {text("model", "flex-end", "borderBottom")}
    </div>
  );
}

interface Rails {
  enterT: number;
  centerT: number;
  exitT: number;
  enterB: number;
  centerB: number;
  exitB: number;
}

/** Where the two rails sit at a column's center: converged on the axis for a sync move, split to the
 *  lane chips for a deviation. */
function laneCenters(col: Column): { t: number; b: number } {
  return col.sync ? { t: CENTER_Y, b: CENTER_Y } : { t: RAIL_TOP_Y, b: RAIL_BOT_Y };
}

/** Rail y-positions for column `i`: its center plus the boundary with each neighbor (their midpoint),
 *  so an adjacent column enters at the same y this one exits, and the rails read as unbroken lines. */
function railsFor(columns: Column[], i: number): Rails {
  const cur = laneCenters(columns[i]);
  const prev = i > 0 ? laneCenters(columns[i - 1]) : cur;
  const next = i < columns.length - 1 ? laneCenters(columns[i + 1]) : cur;
  return {
    enterT: (prev.t + cur.t) / 2,
    centerT: cur.t,
    exitT: (cur.t + next.t) / 2,
    enterB: (prev.b + cur.b) / 2,
    centerB: cur.b,
    exitB: (cur.b + next.b) / 2,
  };
}

/** The two continuous background rails through one column. `preserveAspectRatio="none"` stretches the
 *  0..100 horizontal viewBox to the column's own width while y stays in pixels, so rails join
 *  seamlessly across columns of differing widths; `non-scaling-stroke` keeps the line weight even. */
function RailBg({ rails }: { rails: Rails }) {
  const rail = (enter: number, center: number, exit: number) => (
    <polyline
      points={`0,${enter} 50,${center} 100,${exit}`}
      fill="none"
      stroke={AXIS_COLOR}
      strokeWidth={2}
      vectorEffect="non-scaling-stroke"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
  return (
    <svg
      role="presentation"
      aria-hidden="true"
      width="100%"
      height={COL_H}
      viewBox={`0 0 100 ${COL_H}`}
      preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "visible" }}
    >
      {rail(rails.enterT, rails.centerT, rails.exitT)}
      {rail(rails.enterB, rails.centerB, rails.exitB)}
    </svg>
  );
}

function DeviationColumn({
  col,
  colorOf,
  rails,
}: {
  col: Column;
  colorOf?: (activity: string) => string;
  rails: Rails;
}) {
  const top = col.sync ? null : col.log ? (
    <Lane move={col.log} dir="up" colorOf={colorOf} />
  ) : col.model ? (
    <Skip dir="up" />
  ) : null;
  const bottom = col.sync ? null : col.model ? (
    <Lane move={col.model} dir="down" colorOf={colorOf} />
  ) : col.log ? (
    <Skip dir="down" />
  ) : null;

  // Chips sit above the rails so a move reads as a station on its line; the side padding leaves the
  // rails uncovered between chips (borders still span the full padded width, so the guides stay continuous).
  const band: CSSProperties = {
    position: "relative",
    zIndex: 1,
    paddingLeft: COL_PAD_X,
    paddingRight: COL_PAD_X,
  };

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "stretch" }}>
      <RailBg rails={rails} />
      <div
        style={{
          ...band,
          height: REGION_H,
          display: "flex",
          justifyContent: "center",
          borderTop: `1px solid ${GUIDE_COLOR}`,
        }}
      >
        {top}
      </div>
      <div
        style={{ ...band, height: AXIS_H, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        {col.sync ? (
          <span style={{ background: PANEL_BG, padding: "0 3px", display: "inline-flex" }}>
            <MoveChip move={col.sync} colorOf={colorOf} badge="top" />
          </span>
        ) : null}
      </div>
      <div
        style={{
          ...band,
          height: REGION_H,
          display: "flex",
          justifyContent: "center",
          borderBottom: `1px solid ${GUIDE_COLOR}`,
        }}
      >
        {bottom}
      </div>
    </div>
  );
}

// ─── Vector SVG export ────────────────────────────────────────────────────────
// Standalone SVG (no foreignObject, no external CSS), theme-aware. Reuses `layoutActivityPills` for
// chip width + truncation; the chevron + axis + lanes + icons + labels are drawn here so the colors
// adapt to light/dark (the shared pill renderer bakes light-only colors).

interface SvgTheme {
  bg: string;
  text: string;
  axis: string;
  guide: string;
  faint: string;
}
const SVG_LIGHT: SvgTheme = {
  bg: "#ffffff",
  text: "#1c2024",
  axis: "#d1d5db",
  guide: "#e8e8ec",
  faint: "#8b8d98",
};
const SVG_DARK: SvgTheme = {
  bg: "#111113",
  text: "#edeef0",
  axis: "#43484e",
  guide: "#2a2d31",
  faint: "#7e8389",
};

function svgIsDark(): boolean {
  if (typeof document === "undefined") return false;
  return (
    document.documentElement.classList.contains("dark") ||
    document.documentElement.getAttribute("data-theme") === "dark" ||
    document.querySelector(".radix-themes")?.classList.contains("dark") === true
  );
}

const SVG_LABEL_W = 44;
const SVG_PAD = 14;
const SVG_COL_GAP = 10;
const SVG_GAP_AXIS = 5; // chip edge -> axis
const SVG_REGION_H = 36;
const SVG_SKIP_W = 22;
const SVG_MODEL_ICON_GAP = 2; // nudge only the model icon (below its chip) off the label's descenders
const CHIP_HALF = SVG_PILL_H / 2;

/** `>>` skip placeholder for a lane with no move, matching the DOM dashed pill. */
function svgDrawSkip(parent: SVGElement, cx: number, cy: number): void {
  const w = SVG_SKIP_W;
  const h = 16;
  parent.appendChild(
    svgEl("rect", {
      x: cx - w / 2,
      y: cy - h / 2,
      width: w,
      height: h,
      rx: 5,
      ry: 5,
      fill: "none",
      stroke: SKIP_COLOR,
      "stroke-width": 1,
      "stroke-dasharray": "3 2",
    }),
  );
  const t = svgEl("text", {
    x: cx,
    y: cy,
    "text-anchor": "middle",
    "dominant-baseline": "central",
    "font-size": 10,
    "font-weight": 700,
    fill: SKIP_COLOR,
  });
  t.textContent = ">>";
  parent.appendChild(t);
}

/** Build a standalone, theme-aware vector SVG of the deviation strip. */
export function buildDeviationAlignmentSvg(
  moves: ResolvedMove[],
  opts: { colorOf?: (activity: string) => string } = {},
): string | null {
  if (moves.length === 0) return null;
  const { colorOf } = opts;
  const theme = svgIsDark() ? SVG_DARK : SVG_LIGHT;
  const columns = toColumns(moves);

  const widths = columns.map((c) => {
    if (c.sync) return svgChipWidth(c.sync.label);
    const ws: number[] = [];
    if (c.log) ws.push(svgChipWidth(c.log.label));
    if (c.model) ws.push(svgChipWidth(c.model.label));
    if (!c.log || !c.model) ws.push(SVG_SKIP_W);
    return Math.max(...ws);
  });

  const axisY = SVG_PAD + SVG_REGION_H;
  const topY = axisY - SVG_REGION_H;
  const botY = axisY + SVG_REGION_H;

  let cursor = SVG_LABEL_W + SVG_PAD;
  const centers = widths.map((w) => {
    const cx = cursor + w / 2;
    cursor += w + SVG_COL_GAP;
    return cx;
  });
  const width = cursor - SVG_COL_GAP + SVG_PAD;
  const height = 2 * SVG_REGION_H + 2 * SVG_PAD;

  const svg = svgEl("svg", {
    xmlns: SVG_NS,
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
  }) as SVGSVGElement;
  svg.setAttribute("font-family", "Inter, system-ui, -apple-system, sans-serif");

  const axisX0 = SVG_LABEL_W + SVG_PAD - 4;
  const axisX1 = width - SVG_PAD;
  svg.appendChild(
    svgEl("line", { x1: axisX0, y1: topY, x2: axisX1, y2: topY, stroke: theme.guide, "stroke-width": 1 }),
  );
  svg.appendChild(
    svgEl("line", { x1: axisX0, y1: botY, x2: axisX1, y2: botY, stroke: theme.guide, "stroke-width": 1 }),
  );

  const laneLabel = (text: string, y: number) => {
    const t = svgEl("text", {
      x: SVG_PAD,
      y,
      "font-size": 9,
      "font-weight": 600,
      "letter-spacing": "0.06em",
      fill: theme.faint,
      "dominant-baseline": "central",
    });
    t.textContent = text.toUpperCase();
    svg.appendChild(t);
  };
  laneLabel("log", topY + 7);
  laneLabel("model", botY - 7);

  const chipCenterUp = axisY - (CHIP_HALF + SVG_GAP_AXIS);
  const chipCenterDown = axisY + (CHIP_HALF + SVG_GAP_AXIS);

  // Two shared rails behind the chips: centered under a sync move, split to the lanes at a deviation.
  const railY = (c: Column, split: number) => (c.sync ? axisY : split);
  const drawRail = (split: number) => {
    const pts = [`${axisX0},${railY(columns[0], split)}`];
    columns.forEach((c, i) => {
      pts.push(`${centers[i]},${railY(c, split)}`);
    });
    pts.push(`${axisX1},${railY(columns[columns.length - 1], split)}`);
    svg.appendChild(
      svgEl("polyline", {
        points: pts.join(" "),
        fill: "none",
        stroke: theme.axis,
        "stroke-width": 2,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
    );
  };
  drawRail(chipCenterUp);
  drawRail(chipCenterDown);

  columns.forEach((col, i) => {
    const cx = centers[i];
    if (col.sync) {
      const w = widths[i];
      svg.appendChild(
        svgEl("rect", {
          x: cx - w / 2,
          y: axisY - CHIP_HALF - 2,
          width: w,
          height: SVG_PILL_H + 4,
          fill: theme.bg,
        }),
      );
      svgMoveChip(svg, cx, axisY, col.sync.label, cellColor(col.sync, colorOf), theme);
      svgMoveIcon(svg, cx, axisY - CHIP_HALF, "sync", theme.bg);
      return;
    }
    if (col.log) {
      svgMoveChip(svg, cx, chipCenterUp, col.log.label, cellColor(col.log, colorOf), theme);
      svgMoveIcon(svg, cx, chipCenterUp - CHIP_HALF, "log", theme.bg);
    } else if (col.model) {
      svgDrawSkip(svg, cx, chipCenterUp);
    }
    if (col.model) {
      svgMoveChip(svg, cx, chipCenterDown, col.model.label, cellColor(col.model, colorOf), theme);
      svgMoveIcon(svg, cx, chipCenterDown + CHIP_HALF + SVG_MODEL_ICON_GAP, "model", theme.bg);
    } else if (col.log) {
      svgDrawSkip(svg, cx, chipCenterDown);
    }
  });

  return serializeSvg(svg);
}

/**
 * Deviation-style alignment strip. A central axis carries the synchronous moves;
 * log moves bow upward and model moves bow downward, so non-conformance reads as
 * vertical deviation from the baseline. Moves keep their horizontal order; an
 * adjacent log/model pair shares one column (log above, model below), while a
 * lone log or model move gets a `>>` skip placeholder opposite it.
 *
 * Pass `exportKey` when rendered inside a `ViewerExportFrame` to advertise a true
 * vector SVG of the strip to that frame's export menu.
 */
export function DeviationAlignmentStrip({
  moves,
  colorOf,
  exportKey,
  singleLine,
}: {
  moves: ResolvedMove[];
  colorOf?: (activity: string) => string;
  exportKey?: string;
  singleLine?: boolean;
}) {
  const source = useMemo<VectorExportSource | null>(
    () => (exportKey ? { toSvg: () => buildDeviationAlignmentSvg(moves, { colorOf }) } : null),
    [exportKey, moves, colorOf],
  );
  useRegisterExport(exportKey ?? "deviation-alignment-strip", source);

  if (moves.length === 0) return null;
  const columns = toColumns(moves);
  return (
    <div
      className={`flex items-stretch ${singleLine ? "flex-nowrap w-max" : "flex-wrap"}`}
      style={{ rowGap: 18 }}
    >
      <LaneLabels />
      {columns.map((col, i) => (
        <DeviationColumn key={i} col={col} colorOf={colorOf} rails={railsFor(columns, i)} />
      ))}
    </div>
  );
}
