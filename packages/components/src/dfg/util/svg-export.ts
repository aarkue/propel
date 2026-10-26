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
