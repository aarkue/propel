import { useMemo } from "react";

let ctx: CanvasRenderingContext2D | null | undefined;

const SANS = "system-ui, sans-serif";

/** Width in px of `text` in the given font, or an estimate where there is no canvas. */
export function textWidth(text: string, fontSize: number, weight = 400, family = SANS): number {
  if (ctx === undefined) {
    try {
      ctx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    } catch {
      ctx = null;
    }
  }
  if (!ctx) return text.length * fontSize * (family === SANS ? 0.56 : 0.6);
  ctx.font = `${weight} ${fontSize}px ${family}`;
  return ctx.measureText(text).width;
}

/**
 * The label broken into at most `maxLines` lines no wider than `width`, at word boundaries where
 * possible, with an ellipsis on the last line when the rest does not fit.
 */
export function fitLines(
  label: string,
  width: number,
  maxLines: number,
  fontSize: number,
  weight = 400,
  fits: (text: string) => number = (s) => textWidth(s, fontSize, weight),
): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let i = 0;
  while (i < words.length && lines.length < maxLines) {
    let line = words[i];
    i++;
    while (i < words.length && fits(`${line} ${words[i]}`) <= width) {
      line = `${line} ${words[i]}`;
      i++;
    }
    lines.push(line);
  }
  const last = lines.length - 1;
  if (last < 0) return [];
  const rest = i < words.length;
  if (rest || fits(lines[last]) > width) {
    let s = rest ? `${lines[last]} ${words[i]}` : lines[last];
    while (s.length > 1 && fits(`${s}...`) > width) s = s.slice(0, -1);
    lines[last] = `${s.trimEnd()}...`;
  }
  // A single overlong word on an earlier line is cut as well.
  for (let k = 0; k < last; k++) {
    let s = lines[k];
    if (fits(s) <= width) continue;
    while (s.length > 1 && fits(`${s}...`) > width) s = s.slice(0, -1);
    lines[k] = `${s}...`;
  }
  return lines;
}

/**
 * The one-line fit of a text in `width` px, as {@link fitLines} gives it, cached per text and width
 * so views that re-render on hover do not measure again.
 */
export function useFitText(fontSize: number, weight = 400, family = SANS) {
  return useMemo(() => {
    const cache = new Map<string, string>();
    return (text: string, width: number) => {
      const key = `${width}\u0000${text}`;
      let fitted = cache.get(key);
      if (fitted === undefined) {
        const fits = (t: string) => textWidth(t, fontSize, weight, family);
        fitted = fitLines(text, width, 1, fontSize, weight, fits)[0] ?? "";
        cache.set(key, fitted);
      }
      return fitted;
    };
  }, [fontSize, weight, family]);
}

/** A label centred in a box of `width` x `height`, wrapped and ellipsized to fit; full text on hover. */
export function FitLabel({
  label,
  x,
  y,
  width,
  height,
  fontSize = 11,
  fontWeight = 400,
  fill = "var(--gray-12)",
}: {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontWeight?: number;
  fill?: string;
}) {
  const lh = fontSize * 1.15;
  const maxLines = Math.max(1, Math.floor((height - 4) / lh));
  const lines = fitLines(label, Math.max(8, width - 8), maxLines, fontSize, fontWeight);
  const top = y - ((lines.length - 1) * lh) / 2 + fontSize * 0.36;
  return (
    <text textAnchor="middle" fontSize={fontSize} fontWeight={fontWeight} fill={fill}>
      <title>{label}</title>
      {lines.map((l, k) => (
        <tspan key={k} x={x} y={top + k * lh}>
          {l}
        </tspan>
      ))}
    </text>
  );
}
