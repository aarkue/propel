import { useMemo, type ReactNode } from "react";
import { colorToHex } from "../dfg/util/colors";
import type { ThemeColor } from "../dfg/util/colors";
import type { AlignmentMove } from "./alignment-types";
import type { PetriNet } from "../petri-net";
import {
  ActivityChip,
  CHEV_PX,
  drawChevronPill,
  SVG_CHAR_W,
  SVG_PILL_H,
  SVG_PILL_PAD_X,
} from "./ActivitySequence";
import { svgEl, serializeSvg, SVG_NS } from "../dfg/util/svg-export";
import { useRegisterExport, type VectorExportSource } from "../viewer/export";
import { useColorOf } from "../viewer/viewer-config";

export type MoveKind = "sync" | "log" | "model";

export interface ResolvedMove {
  kind: MoveKind;
  /** Human-readable label: activity name for sync/log moves, transition label for model moves. */
  label: string;
  /** Transition has no label (invisible/tau). */
  hidden: boolean;
}

export const MOVE_COLOR: Record<MoveKind, ThemeColor> = {
  sync: "green",
  log: "amber",
  model: "orange",
};

/** Raw icon geometry per move kind: the exact glyph shown on screen (Font Awesome check / plus,
 *  Bootstrap lightning-fill). One source for the DOM icon (`MoveGlyphIcon`) and the SVG export
 *  (`svgMoveIcon`), so on-screen and exported icons are identical. */
const MOVE_GLYPH: Record<MoveKind, { w: number; h: number; d: string }> = {
  sync: {
    w: 512,
    h: 512,
    d: "M173.898 439.404l-166.4-166.4c-9.997-9.997-9.997-26.206 0-36.204l36.203-36.204c9.997-9.998 26.207-9.998 36.204 0L192 312.69 432.095 72.596c9.997-9.997 26.207-9.997 36.204 0l36.203 36.204c9.997 9.997 9.997 26.206 0 36.204l-294.4 294.401c-9.998 9.997-26.207 9.997-36.204-.001z",
  },
  model: {
    w: 448,
    h: 512,
    d: "M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z",
  },
  log: {
    w: 16,
    h: 16,
    d: "M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.09z",
  },
};

/** A move's kind icon as an inline SVG from the shared glyph path, so the on-screen icon matches the
 *  export exactly. Inherits color from the surrounding `currentColor`. */
export function MoveGlyphIcon({ kind, size = 12 }: { kind: MoveKind; size?: number }) {
  const g = MOVE_GLYPH[kind];
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${g.w} ${g.h}`}
      fill="currentColor"
      role="presentation"
      aria-hidden="true"
      focusable={false}
    >
      <path d={g.d} />
    </svg>
  );
}

export function resolveMove(move: AlignmentMove, activities: string[], net: PetriNet): ResolvedMove {
  if ("SyncMove" in move) {
    const act = activities[move.SyncMove.trace_event_index];
    const tLabel = net.transitions.find((t) => t.id === move.SyncMove.transition)?.label ?? null;
    return { kind: "sync", label: act ?? tLabel ?? "?", hidden: false };
  }
  if ("LogMove" in move) {
    const act = activities[move.LogMove.trace_event_index];
    return { kind: "log", label: act ?? "?", hidden: false };
  }
  const tLabel = net.transitions.find((t) => t.id === move.ModelMove.transition)?.label ?? null;
  const hidden = tLabel == null || tLabel === "";
  return { kind: "model", label: hidden ? " τ" : tLabel!, hidden };
}

const SKIP_COLOR = "#9ca3af";

const MOVE_ICON: Record<MoveKind, ReactNode> = {
  sync: <MoveGlyphIcon kind="sync" size={12} />,
  model: <MoveGlyphIcon kind="model" size={12} />,
  log: <MoveGlyphIcon kind="log" size={12} />,
};

function cellColor(
  kind: MoveKind,
  label: string,
  hidden: boolean,
  colorOf?: (activity: string) => string,
): string {
  if (kind === "model" && hidden) return SKIP_COLOR;
  return colorOf?.(label) ?? colorToHex(MOVE_COLOR[kind]);
}

// ─── Vector SVG export ────────────────────────────────────────────────────────
// Standalone, theme-aware SVG (no foreignObject, no external CSS) of the two-row strip. Reuses
// `layoutActivityPills` for chip width + shape; the top border, kind icons and pill colors are drawn
// here so they adapt to light/dark (the shared pill renderer bakes light-only colors).

interface SvgTheme {
  bg: string;
  text: string;
}
const SVG_LIGHT: SvgTheme = { bg: "#ffffff", text: "#1c2024" };
const SVG_DARK: SvgTheme = { bg: "#111113", text: "#edeef0" };

function svgIsDark(): boolean {
  if (typeof document === "undefined") return false;
  return (
    document.documentElement.classList.contains("dark") ||
    document.documentElement.getAttribute("data-theme") === "dark" ||
    document.querySelector(".radix-themes")?.classList.contains("dark") === true
  );
}

function parseHex(hex: string): [number, number, number] | null {
  if (hex[0] !== "#" || hex.length < 7) return null;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** Mix two hex colors; `weight` is the share of `hex` (rest is `other`). Mirrors the DOM
 *  `color-mix(... Canvas / CanvasText)` soft-badge styling so chips read the same in both themes. */
function mixHex(hex: string, other: string, weight: number): string {
  const a = parseHex(hex);
  const b = parseHex(other);
  if (!a || !b) return hex;
  return `#${a
    .map((v, i) =>
      Math.max(0, Math.min(255, Math.round(v * weight + b[i] * (1 - weight))))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

const SVG_PAD = 14;
const SVG_COL_GAP = 8;
const SVG_ROW_GAP = 8; // gap between the log chip and the model chip
const SVG_BORDER_GAP = 7; // colored top border -> log chip
const SVG_ICON_R = 7;
const CHIP_HALF = SVG_PILL_H / 2;

// Match the DOM `ActivityChip`: a 14px medium Inter label capped at 8rem then ellipsized. Widths are
// measured against that exact font (via canvas) so exported chips size like the on-screen ones,
// rather than the coarse character-count estimate that made longer labels drift.
const CHIP_FONT_SIZE = 14;
const CHIP_FONT_WEIGHT = 500;
const CHIP_FONT = `${CHIP_FONT_WEIGHT} ${CHIP_FONT_SIZE}px Inter, system-ui, -apple-system, sans-serif`;
const CHIP_MAX_TEXT_W = 128; // ActivityChip's max-w-[8rem]

let measureCtx: CanvasRenderingContext2D | null | undefined;
function measureChipText(text: string): number {
  if (measureCtx === undefined) {
    measureCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
    if (measureCtx) measureCtx.font = CHIP_FONT;
  }
  return measureCtx ? measureCtx.measureText(text).width : text.length * SVG_CHAR_W;
}

/** The label truncated (with an ellipsis) to the chip's max width, and the resulting pill width. */
function chipMetrics(label: string): { label: string; w: number } {
  let shown = label;
  if (measureChipText(shown) > CHIP_MAX_TEXT_W) {
    while (shown.length > 1 && measureChipText(`${shown}…`) > CHIP_MAX_TEXT_W) shown = shown.slice(0, -1);
    shown = `${shown}…`;
  }
  return { label: shown, w: measureChipText(shown) + SVG_PILL_PAD_X * 2 + CHEV_PX };
}

export function svgChipWidth(label: string): number {
  return chipMetrics(label).w;
}

/** Draw an alignment move's chevron chip, theme-aware, matching the DOM `ActivityChip` soft badge
 *  (18% tint fill, 75% text, no border) and its 14px label. Shared by the trace and deviation strips. */
export function svgMoveChip(
  parent: SVGElement,
  cx: number,
  cy: number,
  label: string,
  color: string,
  theme: { bg: string; text: string },
): void {
  const { label: shown, w } = chipMetrics(label);
  drawChevronPill(parent, {
    cx,
    cy,
    w,
    label: shown,
    fill: mixHex(color, theme.bg, 0.18),
    textColor: mixHex(color, theme.text, 0.75),
    fontSize: CHIP_FONT_SIZE,
    fontWeight: CHIP_FONT_WEIGHT,
  });
}

const SVG_GLYPH_SIZE = 10;

/** Draw a move's kind icon (the exact on-screen glyph) as a filled path on a solid disc, centered at
 *  `(cx, cy)`. Shared by both strips. */
export function svgMoveIcon(parent: SVGElement, cx: number, cy: number, kind: MoveKind, bg: string): void {
  const color = colorToHex(MOVE_COLOR[kind]);
  parent.appendChild(svgEl("circle", { cx, cy, r: SVG_ICON_R, fill: bg }));
  const g = MOVE_GLYPH[kind];
  const scale = SVG_GLYPH_SIZE / Math.max(g.w, g.h);
  const gw = g.w * scale;
  const gh = g.h * scale;
  parent.appendChild(
    svgEl("path", {
      d: g.d,
      fill: color,
      transform: `translate(${cx - gw / 2} ${cy - gh / 2}) scale(${scale})`,
    }),
  );
}

/** Build a standalone, theme-aware vector SVG of the two-row trace strip: each move is a column with
 *  a colored top border + kind icon, a log chip (top row) and a model chip (bottom row); the row a
 *  move does not touch shows a `>>` skip chip. */
export function buildTraceAlignmentSvg(
  moves: ResolvedMove[],
  opts: { colorOf?: (activity: string) => string } = {},
): string | null {
  if (moves.length === 0) return null;
  const { colorOf } = opts;
  const theme = svgIsDark() ? SVG_DARK : SVG_LIGHT;

  const cells = moves.map((m) => {
    const logActive = m.kind !== "model";
    const modelActive = m.kind !== "log";
    const active = cellColor(m.kind, m.label, m.hidden, colorOf);
    return {
      kind: m.kind,
      top: { label: logActive ? m.label : ">>", color: logActive ? active : SKIP_COLOR },
      bot: { label: modelActive ? m.label : ">>", color: modelActive ? active : SKIP_COLOR },
    };
  });

  const widths = cells.map((c) => Math.max(svgChipWidth(c.top.label), svgChipWidth(c.bot.label)));

  const borderY = SVG_PAD + SVG_ICON_R;
  const logY = borderY + SVG_BORDER_GAP + CHIP_HALF;
  const modelY = logY + SVG_PILL_H + SVG_ROW_GAP;

  let cursor = SVG_PAD;
  const centers = widths.map((w) => {
    const cx = cursor + w / 2;
    cursor += w + SVG_COL_GAP;
    return cx;
  });
  const width = cursor - SVG_COL_GAP + SVG_PAD;
  const height = modelY + CHIP_HALF + SVG_PAD;

  const svg = svgEl("svg", {
    xmlns: SVG_NS,
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
  }) as SVGSVGElement;
  svg.setAttribute("font-family", "Inter, system-ui, -apple-system, sans-serif");

  cells.forEach((c, i) => {
    const cx = centers[i];
    const w = widths[i];
    const borderColor = colorToHex(MOVE_COLOR[c.kind]);
    svg.appendChild(
      svgEl("line", {
        x1: cx - w / 2,
        y1: borderY,
        x2: cx + w / 2,
        y2: borderY,
        stroke: borderColor,
        "stroke-width": 3,
        "stroke-linecap": "round",
      }),
    );
    svgMoveChip(svg, cx, logY, c.top.label, c.top.color, theme);
    svgMoveChip(svg, cx, modelY, c.bot.label, c.bot.color, theme);
    svgMoveIcon(svg, cx, borderY, c.kind, theme.bg);
  });

  return serializeSvg(svg);
}

/**
 * Two-row alignment strip: log moves on top, model moves on bottom.
 *
 * Pass `exportKey` when rendered inside a `ViewerExportFrame` to advertise a true vector SVG of the
 * strip to that frame's export menu.
 * **/
export function TraceAlignmentStrip({
  moves,
  colorOf,
  exportKey,
  singleLine,
}: {
  moves: ResolvedMove[];
  /** Per-activity chip color; defaults to the ambient `ViewerConfig` colorOf (scope "activity"). */
  colorOf?: (activity: string) => string;
  exportKey?: string;
  singleLine?: boolean;
}) {
  const ambient = useColorOf("activity");
  const resolve = colorOf ?? ambient;
  const source = useMemo<VectorExportSource | null>(
    () => (exportKey ? { toSvg: () => buildTraceAlignmentSvg(moves, { colorOf: resolve }) } : null),
    [exportKey, moves, resolve],
  );
  useRegisterExport(exportKey ?? "trace-alignment-strip", source);

  if (moves.length === 0) return null;
  return (
    <div className={`flex items-start gap-1 ${singleLine ? "flex-nowrap w-max" : "flex-wrap"}`}>
      {moves.map((move, i) => {
        const borderColor = colorToHex(MOVE_COLOR[move.kind]);
        const color = cellColor(move.kind, move.label, move.hidden, resolve);
        const modelActivity = move.kind !== "log";
        const logActivity = move.kind !== "model";
        return (
          <div
            key={i}
            className="px-0.5 py-0.5 mt-3"
            style={{
              position: "relative",
              borderTop: `3px solid ${borderColor}`,
              display: "grid",
              gridTemplateColumns: "max-content",
              gap: 2,
            }}
          >
            <span
              className="mx-auto -mt-4"
              style={{
                color: borderColor,
                display: "flex",
                lineHeight: 1,
                background: "var(--color-panel-solid, Canvas)",
                borderRadius: "9999px",
                padding: "2px 2px",
                zIndex: 1,
              }}
            >
              {MOVE_ICON[move.kind]}
            </span>
            <ActivityChip
              activity={logActivity ? move.label : ">>"}
              color={logActivity ? color : SKIP_COLOR}
              chain={false}
              className={logActivity ? undefined : "min-w-full"}
              widthClass={logActivity ? undefined : "w-full"}
            />
            <ActivityChip
              activity={modelActivity ? move.label : ">>"}
              color={modelActivity ? color : SKIP_COLOR}
              chain={false}
              className={modelActivity ? undefined : "min-w-full"}
              widthClass={modelActivity ? undefined : "w-full"}
            />
          </div>
        );
      })}
    </div>
  );
}
