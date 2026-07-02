import { Badge } from "@r4pm/components/ui";
import type { CSSProperties } from "react";
import { softBadgeStyle } from "../dfg/util/colors";
import { darken, svgEl } from "../dfg/util/svg-export";
import { useColorOf } from "../viewer/viewer-config";

// Chevron pill geometry, shared by both the CSS clip-path
// on ActivityChip and the SVG export renderer. `CHEV_PX` matches `--chev` on
// the screen component so exported images look identical to the panel.
export const CHEV_PX = 6;
/** Chevron pill outline as a CSS clip-path; percentage-based so it stretches to any width.
 *  Reads `--chev` (set to `${CHEV_PX}px`) for the notch/arrow depth. */
export const CHEVRON_CLIP_PATH =
  "polygon(calc(100% - var(--chev)) 0%, 100% 50%, calc(100% - var(--chev)) 100%, 0% 100%, var(--chev) 50%, 0% 0%)";
export const SVG_PILL_H = 22;
export const SVG_PILL_PAD_X = 10;
export const SVG_CHAR_W = 7;
export const SVG_MAX_PILL_CHARS = 18;
// Gap (px) between the arrow tip of pill N and the notch base of pill N+1.
// With CHEV_PX=6 and GAP=4 the advance is pillW-2, giving 2px visual overlap,
// matching the -mx-0.5 / gap-0.5 behaviour of the React layout.
export const SVG_CHEV_GAP = 4;

export interface SvgPill {
  label: string;
  w: number;
  x: number;
  line: number;
  color: string;
}

/**
 * Lay out chevron pills for one activity sequence within a bounded horizontal
 * area, wrapping onto new lines when needed. Returns absolute pill positions
 * and total line count; pass the result to {@link renderActivityPillsSvg}.
 */
export function layoutActivityPills(
  activities: string[],
  opts: { startX: number; maxRight: number; colorOf: (a: string) => string },
): { pills: SvgPill[]; lineCount: number } {
  const { startX, maxRight, colorOf } = opts;
  const pills: SvgPill[] = [];
  let line = 0;
  let cursorX = startX;
  for (const act of activities) {
    const label = act.length > SVG_MAX_PILL_CHARS ? `${act.slice(0, SVG_MAX_PILL_CHARS - 1)}…` : act;
    const pillW = label.length * SVG_CHAR_W + SVG_PILL_PAD_X * 2 + CHEV_PX;
    if (cursorX + pillW > maxRight && cursorX > startX) {
      line++;
      cursorX = startX;
    }
    pills.push({ label, w: pillW, x: cursorX, line, color: colorOf(act) });
    cursorX += pillW - CHEV_PX + SVG_CHEV_GAP;
  }
  return { pills, lineCount: Math.max(1, line + 1) };
}

/**
 * Draw one chevron pill (outline + centered label) centered at `(cx, cy)`. The single source of the
 * chevron polygon + label placement, shared by the sequence exporter and the alignment strips so the
 * shape and text stay identical everywhere. `stroke` is optional (omit for a borderless soft badge,
 * matching the DOM `ActivityChip`).
 */
export function drawChevronPill(
  parent: SVGElement,
  opts: {
    cx: number;
    cy: number;
    w: number;
    label: string;
    fill: string;
    stroke?: string;
    textColor: string;
    fontSize?: number;
    fontWeight?: number;
  },
): void {
  const { cx, cy, w, label, fill, stroke, textColor, fontSize = 11, fontWeight = 600 } = opts;
  const cv = CHEV_PX;
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - SVG_PILL_H / 2;
  const y1 = cy + SVG_PILL_H / 2;
  parent.appendChild(
    svgEl("polygon", {
      points: `${x0},${y0} ${x1 - cv},${y0} ${x1},${cy} ${x1 - cv},${y1} ${x0},${y1} ${x0 + cv},${cy}`,
      fill,
      ...(stroke ? { stroke, "stroke-width": 1.25, "stroke-linejoin": "round" } : {}),
    }),
  );
  const labelEl = svgEl("text", {
    x: cx,
    y: cy,
    "text-anchor": "middle",
    "dominant-baseline": "central",
    "font-size": fontSize,
    "font-weight": fontWeight,
    fill: textColor,
  });
  labelEl.textContent = label;
  parent.appendChild(labelEl);
}

/**
 * Append chevron pill polygons and labels to `parent`. Renders back-to-front
 * so the left notch of pill N+1 visually slots over the arrow tip of pill N.
 * `rowTopY` is the absolute top of this sequence row; `rowHeight` is the
 * per-line height.
 */
export function renderActivityPillsSvg(
  parent: SVGElement,
  pills: SvgPill[],
  rowTopY: number,
  rowHeight: number,
): void {
  const yMid = (line: number) => rowTopY + line * rowHeight + rowHeight / 2;
  for (let k = pills.length - 1; k >= 0; k--) {
    const p = pills[k];
    drawChevronPill(parent, {
      cx: p.x + p.w / 2,
      cy: yMid(p.line),
      w: p.w,
      label: p.label,
      fill: `${p.color}26`,
      stroke: p.color,
      textColor: darken(p.color, 0.55),
    });
  }
}

/** A single chevron-clipped activity badge, soft-tinted by `color` (a hex). `widthClass` controls
 *  the inner label sizing (e.g. a fixed `"w-12"` for short codes, or the default cap).
 *  Set `chain={false}` when using the chip standalone (removes the `-mx-0.5` chain overlap). */
export function ActivityChip({
  activity,
  color,
  widthClass = "max-w-[8rem]",
  chain = true,
  className,
}: {
  activity: string;
  color: string;
  widthClass?: string;
  chain?: boolean;
  /** Extra classes applied to the outer Badge element. */
  className?: string;
}) {
  return (
    <Badge
      style={
        {
          ...softBadgeStyle(color),
          "--chev": `${CHEV_PX}px`,
          clipPath: CHEVRON_CLIP_PATH,
        } as CSSProperties
      }
      title={activity}
      className={
        [chain ? "-mx-0.5" : undefined, "inline-flex justify-center", className].filter(Boolean).join(" ") ||
        undefined
      }
      size="2"
    >
      <span
        className={`truncate text-center text-sm whitespace-pre ${widthClass}`}
        style={{ paddingInline: "calc(var(--chev) + 2px)" }}
      >
        {activity}
      </span>
    </Badge>
  );
}

/** A horizontal run of chevron activity chips representing one trace / variant. `colorOf` overrides
 *  the chip color per activity; defaults to the ambient `ViewerConfig` colorOf (scope "activity"),
 *  falling back to the stable hashed palette. */
export function ActivitySequence({
  activities,
  colorOf,
  widthClass,
}: {
  activities: string[];
  colorOf?: (activity: string) => string;
  widthClass?: string;
}) {
  const ambient = useColorOf("activity");
  const resolve = colorOf ?? ambient;
  return (
    <div className="flex items-center flex-wrap gap-0.5">
      {activities.map((a, i) => (
        <ActivityChip key={`${i}-${a}`} activity={a} color={resolve(a)} widthClass={widthClass} />
      ))}
    </div>
  );
}
