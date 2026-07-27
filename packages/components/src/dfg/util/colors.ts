import type { CSSProperties } from "react";

export const COLORS = [
  "amber",
  "blue",
  "crimson",
  "cyan",
  "green",
  "indigo",
  "iris",
  "jade",
  "lime",
  "mint",
  "orange",
  "pink",
  "plum",
  "purple",
  "red",
  "ruby",
  "sky",
  "teal",
  "tomato",
  "violet",
  "yellow",
  "gold",
] as const;

export const COLORS_MAP: Record<(typeof COLORS)[number], string> = {
  amber: "#ffba18",
  blue: "#0588f0",
  crimson: "#df3478",
  cyan: "#0797b9",
  gold: "#8c7a5e",
  green: "#2b9a66",
  indigo: "#3358d4",
  iris: "#5151cd",
  jade: "#26997b",
  lime: "#b0e64c",
  mint: "#7de0cb",
  orange: "#ef5f00",
  pink: "#cf3897",
  plum: "#a144af",
  purple: "#8347b9",
  red: "#dc3e42",
  ruby: "#dc3b5d",
  sky: "#74daf8",
  teal: "#0d9b8a",
  tomato: "#dd4425",
  violet: "#654dc4",
  yellow: "#ffdc00",
};
export const FOREGROUND_COLORS_MAP: Record<(typeof COLORS)[number], string> = {
  amber: "#ab6400",
  blue: "#0d74ce",
  crimson: "#cb1d63",
  cyan: "#107d98",
  gold: "#71624b",
  green: "#218358",
  indigo: "#3a5bc7",
  iris: "#5753c6",
  jade: "#208368",
  lime: "#5c7c2f",
  mint: "#027864",
  orange: "#cc4e00",
  pink: "#c2298a",
  plum: "#953ea3",
  purple: "#8145b5",
  red: "#ce2c31",
  ruby: "#ca244d",
  sky: "#00749e",
  teal: "#008573",
  tomato: "#d13415",
  violet: "#6550b9",
  yellow: "#9e6c00",
};
export const LIGHT_COLORS_MAP: Record<(typeof COLORS)[number], string> = {
  amber: "#f3d673",
  blue: "#acd8fc",
  crimson: "#f3bed1",
  cyan: "#9ddde7",
  gold: "#d8d0bf",
  green: "#adddc0",
  indigo: "#c1d0ff",
  iris: "#cbcdff",
  jade: "#acdec8",
  lime: "#c2da91",
  mint: "#9ce0d0",
  orange: "#ffc182",
  pink: "#efbfdd",
  plum: "#e9c2ec",
  purple: "#e0c4f4",
  red: "#fdbdbe",
  ruby: "#f8bfc8",
  sky: "#a9daed",
  teal: "#a1ded2",
  tomato: "#fdbdaf",
  violet: "#d4cafe",
  yellow: "#f3d768",
};
export type ThemeColor = (typeof COLORS)[number];

export function colorToHex(color: ThemeColor, mode: "normal" | "foreground" | "light" = "normal"): string {
  if (mode === "normal") {
    return COLORS_MAP[color];
  }
  if (mode === "foreground") {
    return FOREGROUND_COLORS_MAP[color];
  }

  if (mode === "light") {
    return LIGHT_COLORS_MAP[color];
  }

  return COLORS_MAP[color];
}

export function hexTriple(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
export const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((x) => clampByte(x).toString(16).padStart(2, "0")).join("")}`;

/** Mix `a` toward `b` by `t` (0..1). Both `#rrggbb`. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexTriple(a);
  const [br, bg, bb] = hexTriple(b);
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/** Derive a text/border ("foreground") or fill ("light") shade from a hex, mixed against system Canvas/CanvasText so it follows the active theme. */
export function shadeHex(hex: string, mode: "normal" | "foreground" | "light" = "normal"): string {
  if (mode === "normal" || hex[0] !== "#" || hex.length < 7) return hex;
  if (mode === "foreground") return `color-mix(in srgb, ${hex} 75%, CanvasText)`;
  return `color-mix(in srgb, ${hex} 20%, Canvas)`;
}

/** Default arc stroke when no data color applies; exporters must route this through `flattenColor`, a raw `var()` reaches the renderer unresolved. */
export const DEFAULT_ARC_COLOR = "var(--gray-11)";

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const HEX8 = /^#[0-9a-fA-F]{8}$/;

let probeEl: HTMLElement | null = null;
let probeHost: HTMLElement | null = null;

/** Resolve any CSS color string to sRGB [r, g, b, a] via a DOM probe pinned to a light theme scope, so exports are theme-independent. Returns null outside the DOM or for unparseable input. */
function resolveViaDom(color: string): [number, number, number, number] | null {
  if (typeof document === "undefined") return null;
  if (!probeHost) {
    probeHost = document.createElement("div");
    // own light Radix scope so tokens resolve light even inside a dark app
    probeHost.className = "radix-themes light light-theme";
    probeHost.style.cssText =
      "position:absolute;width:0;height:0;visibility:hidden;pointer-events:none;color-scheme:light";
  }
  if (probeHost.parentElement !== document.body) document.body.appendChild(probeHost);
  if (!probeEl) {
    probeEl = document.createElement("span");
    probeHost.appendChild(probeEl);
  }
  probeEl.style.color = "";
  probeEl.style.color = color;
  if (!probeEl.style.color) return null;
  const computed = getComputedStyle(probeEl).color;
  const nums = (s: string) =>
    s
      .split(/[,\s/]+/)
      .filter(Boolean)
      .map(Number);
  const m = computed.match(/^rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b, a = 1] = nums(m[1]);
    if ([r, g, b].some(Number.isNaN)) return null;
    return [r, g, b, a];
  }
  const srgb = computed.match(/^color\(srgb\s+([^)]+)\)/);
  if (srgb) {
    const [r, g, b, a = 1] = nums(srgb[1]);
    if ([r, g, b].some(Number.isNaN)) return null;
    return [r * 255, g * 255, b * 255, a];
  }
  return null;
}

/** The export background as a solid `#rrggbb`, for compositing translucent export colors.
 *  Always the LIGHT theme background (see `resolveViaDom`): exports don't follow the app theme. */
export function exportBackgroundHex(): string {
  const bg = resolveViaDom("var(--color-background)");
  if (bg) return toHex(bg[0], bg[1], bg[2]);
  return "#ffffff";
}

/** Flatten any CSS color to a solid, export-safe `#rrggbb`, compositing translucency over `bgHex`. */
export function flattenColor(color: string, bgHex = "#ffffff"): string {
  if (!color) return color;
  if (HEX6.test(color)) return color.toLowerCase();

  let rgba: [number, number, number, number] | null = null;
  if (HEX8.test(color)) {
    const n = parseInt(color.slice(1), 16);
    rgba = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, (n & 255) / 255];
  } else {
    rgba = resolveViaDom(color);
  }
  if (!rgba) return HEX8.test(color) ? `#${color.slice(1, 7).toLowerCase()}` : bgHex;

  const [r, g, b, a] = rgba;
  if (a >= 1) return toHex(r, g, b);
  const [br, bg, bb] = hexTriple(HEX6.test(bgHex) ? bgHex : "#ffffff");
  return toHex(r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a));
}

/** Soft-badge styling from a hex. Uses color-mix with CSS system colors so the tint and text
 *  automatically adapt to light and dark mode without class detection. */
export function softBadgeStyle(hex: string): CSSProperties {
  return {
    backgroundColor: `color-mix(in srgb, ${hex} 18%, Canvas)`,
    color: `color-mix(in srgb, ${hex} 75%, CanvasText)`,
  };
}
