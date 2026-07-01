export interface DotInfo {
  objectType: string;
  color: string;
  /**
   * Edge-label semantic: "each" = one filled dot, "all" = three filled,
   * "any" = one filled + two hollow. Mutually exclusive with `variant`.
   */
  quantifier?: "each" | "any" | "all";
  /**
   * Node-dot semantic: "single" = one filled dot (always-exactly-one),
   * "multi" = three filled dots (variable / multiple). Takes precedence
   * over `quantifier` when set.
   */
  variant?: "single" | "multi";
  /** Optional tooltip override; defaults to `<quantifier/variant>(<objectType>)`. */
  title?: string;
}

/** Darken a hex color by mixing toward black. Non-hex inputs (e.g. CSS vars) pass through to the node text color. */
function darken(hex: string, amount = 0.35): string {
  if (!hex.startsWith("#")) return "var(--r4pm-node-text)";
  const c = hex.replace("#", "");
  const r = Math.round(parseInt(c.substring(0, 2), 16) * (1 - amount));
  const g = Math.round(parseInt(c.substring(2, 4), 16) * (1 - amount));
  const b = Math.round(parseInt(c.substring(4, 6), 16) * (1 - amount));
  return `rgb(${r},${g},${b})`;
}

type Shape = "single-filled" | "three-filled" | "one-filled-two-hollow";

/**
 * Render a dot pill. Two semantic modes share the same shapes:
 *  - `variant`: "single" (single filled dot) or "multi" (three filled dots),
 *    used for activity-node involvement dots.
 *  - `quantifier`: "each" / "all" / "any", used for edge-label quantifier dots.
 *    "each" = single filled, "all" = three filled, "any" = one filled + two hollow.
 *
 * `variant` takes precedence over `quantifier` if both are set.
 */
export function MultiDot({ dot }: { dot: DotInfo }) {
  const r = 4.33;
  const step = 3.1;
  const sw = 1;
  const border = darken(dot.color);
  const w = r * 2 + step * 2 + sw * 2;
  const h = r * 2 + sw * 2;
  const cy = h / 2;
  const x0 = r + sw;

  let shape: Shape = "single-filled";
  let label: string;
  if (dot.variant === "multi") {
    shape = "three-filled";
    label = `multi(${dot.objectType})`;
  } else if (dot.variant === "single") {
    shape = "single-filled";
    label = `single(${dot.objectType})`;
  } else if (dot.quantifier === "all") {
    shape = "three-filled";
    label = `all(${dot.objectType})`;
  } else if (dot.quantifier === "any") {
    shape = "one-filled-two-hollow";
    label = `any(${dot.objectType})`;
  } else {
    shape = "single-filled";
    label = `each(${dot.objectType})`;
  }
  const title = dot.title ?? label;

  if (shape === "three-filled") {
    return (
      <span title={title}>
        <svg width={w} height={h} style={{ flexShrink: 0, display: "block" }} aria-hidden="true">
          <circle cx={x0 + step * 2} cy={cy} r={r} fill={dot.color} stroke={border} strokeWidth={sw} />
          <circle cx={x0 + step} cy={cy} r={r} fill={dot.color} stroke={border} strokeWidth={sw} />
          <circle cx={x0} cy={cy} r={r} fill={dot.color} stroke={border} strokeWidth={sw} />
        </svg>
      </span>
    );
  }
  if (shape === "one-filled-two-hollow") {
    return (
      <span title={title}>
        <svg width={w} height={h} style={{ flexShrink: 0, display: "block" }} aria-hidden="true">
          <circle cx={x0 + step * 2} cy={cy} r={r} fill="white" stroke={border} strokeWidth={sw} />
          <circle cx={x0 + step} cy={cy} r={r} fill="white" stroke={border} strokeWidth={sw} />
          <circle cx={x0} cy={cy} r={r} fill={dot.color} stroke={border} strokeWidth={sw} />
        </svg>
      </span>
    );
  }
  const s = r * 2 + sw * 2;
  return (
    <span title={title}>
      <svg width={s} height={s} style={{ flexShrink: 0, display: "block" }} aria-hidden="true">
        <circle cx={s / 2} cy={s / 2} r={r} fill={dot.color} stroke={border} strokeWidth={sw} />
      </svg>
    </span>
  );
}
