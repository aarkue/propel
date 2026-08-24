export interface DotInfo {
  objectType: string;
  color: string;
  /** Second colour for an O2O association: the disc is split, left half `color`, right half this. */
  color2?: string;
  /** Edge-label semantic: "each" = one filled dot, "all" = three filled, "any" = one filled + two hollow. */
  quantifier?: "each" | "any" | "all";
  /** Node-dot semantic: "single" = one filled dot, "multi" = three filled dots. Takes precedence over `quantifier`. */
  variant?: "single" | "multi";
  /** Node involvement cardinality: max sets dot count, min 0 draws a dashed border. Takes precedence over `variant`. */
  card?: "0..1" | "0..*" | "1..1" | "1..*";
  /** Optional tooltip override; defaults to `<quantifier/variant>(<objectType>)`. */
  title?: string;
}

/** Border shade for a dot: mixes the fill toward `CanvasText` for a contrasting ring in both themes. */
function border(color: string, amount = 0.35): string {
  return `color-mix(in srgb, ${color} ${Math.round((1 - amount) * 100)}%, CanvasText)`;
}

type Shape = "single-filled" | "three-filled" | "one-filled-two-hollow";

/**
 * One filled disc: a plain circle, or split down the middle when `color2` is set. That split is how
 * an O2O association reads, left half the type the relation points from, right half the one it
 * points to. Same footprint either way, which leaves the quantifier shapes below untouched.
 */
function Disc({
  cx,
  cy,
  r,
  color,
  color2,
  stroke,
  sw,
  dash,
}: {
  cx: number;
  cy: number;
  r: number;
  color: string;
  color2?: string;
  stroke: string;
  sw: number;
  dash?: string;
}) {
  if (!color2) {
    return (
      <circle cx={cx} cy={cy} r={r} fill={color} stroke={stroke} strokeWidth={sw} strokeDasharray={dash} />
    );
  }
  // Sweep 0 goes left from top to bottom, sweep 1 right.
  return (
    <>
      <path d={`M ${cx},${cy - r} A ${r},${r} 0 0,0 ${cx},${cy + r} Z`} fill={color} />
      <path d={`M ${cx},${cy - r} A ${r},${r} 0 0,1 ${cx},${cy + r} Z`} fill={color2} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={stroke} strokeWidth={sw} strokeDasharray={dash} />
    </>
  );
}

/** Render a dot pill; `variant` (node involvement) takes precedence over `quantifier` (edge label) if both are set. */
export function MultiDot({ dot }: { dot: DotInfo }) {
  const r = 4.33;
  const step = 3.1;
  const sw = 1;
  const stroke = border(dot.color);
  const w = r * 2 + step * 2 + sw * 2;
  const h = r * 2 + sw * 2;
  const cy = h / 2;
  const x0 = r + sw;

  // Cardinality mode: dashed border marks optional (min 0), solid marks mandatory (min >= 1).
  if (dot.card) {
    const many = dot.card.endsWith("*");
    const optional = dot.card.startsWith("0");
    const dash = optional ? "2.2 1.6" : undefined;
    const title2 = dot.title ?? `${dot.card} (${dot.objectType})`;
    const cxs = many ? [x0, x0 + step, x0 + step * 2] : [(r * 2 + sw * 2) / 2];
    const sw2 = optional ? sw + 0.3 : sw;
    return (
      <span title={title2}>
        <svg
          width={many ? w : r * 2 + sw * 2}
          height={h}
          style={{ flexShrink: 0, display: "block" }}
          aria-hidden="true"
        >
          {cxs.map((cx) => (
            <Disc
              key={cx}
              cx={cx}
              cy={cy}
              r={r}
              color={dot.color}
              color2={dot.color2}
              stroke={stroke}
              sw={sw2}
              dash={dash}
            />
          ))}
        </svg>
      </span>
    );
  }

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
          {[x0 + step * 2, x0 + step, x0].map((cx) => (
            <Disc
              key={cx}
              cx={cx}
              cy={cy}
              r={r}
              color={dot.color}
              color2={dot.color2}
              stroke={stroke}
              sw={sw}
            />
          ))}
        </svg>
      </span>
    );
  }
  if (shape === "one-filled-two-hollow") {
    return (
      <span title={title}>
        <svg width={w} height={h} style={{ flexShrink: 0, display: "block" }} aria-hidden="true">
          <circle cx={x0 + step * 2} cy={cy} r={r} fill="Canvas" stroke={stroke} strokeWidth={sw} />
          <circle cx={x0 + step} cy={cy} r={r} fill="Canvas" stroke={stroke} strokeWidth={sw} />
          <Disc cx={x0} cy={cy} r={r} color={dot.color} color2={dot.color2} stroke={stroke} sw={sw} />
        </svg>
      </span>
    );
  }
  const s = r * 2 + sw * 2;
  return (
    <span title={title}>
      <svg width={s} height={s} style={{ flexShrink: 0, display: "block" }} aria-hidden="true">
        <Disc cx={s / 2} cy={s / 2} r={r} color={dot.color} color2={dot.color2} stroke={stroke} sw={sw} />
      </svg>
    </span>
  );
}
