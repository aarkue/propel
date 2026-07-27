export interface DotInfo {
  objectType: string;
  color: string;
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
            <circle
              key={cx}
              cx={cx}
              cy={cy}
              r={r}
              fill={dot.color}
              stroke={stroke}
              strokeWidth={sw2}
              strokeDasharray={dash}
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
          <circle cx={x0 + step * 2} cy={cy} r={r} fill={dot.color} stroke={stroke} strokeWidth={sw} />
          <circle cx={x0 + step} cy={cy} r={r} fill={dot.color} stroke={stroke} strokeWidth={sw} />
          <circle cx={x0} cy={cy} r={r} fill={dot.color} stroke={stroke} strokeWidth={sw} />
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
          <circle cx={x0} cy={cy} r={r} fill={dot.color} stroke={stroke} strokeWidth={sw} />
        </svg>
      </span>
    );
  }
  const s = r * 2 + sw * 2;
  return (
    <span title={title}>
      <svg width={s} height={s} style={{ flexShrink: 0, display: "block" }} aria-hidden="true">
        <circle cx={s / 2} cy={s / 2} r={r} fill={dot.color} stroke={stroke} strokeWidth={sw} />
      </svg>
    </span>
  );
}
