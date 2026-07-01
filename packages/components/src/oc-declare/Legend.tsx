import { useState } from "react";
import { FaQuestionCircle } from "react-icons/fa";
import { MultiDot } from "./MultiDot";

/** Use currentColor so legend arcs/dots inherit from the surrounding text. */
const MARKER = "currentColor";

/**
 * Ultra-compact legend explaining arc types and quantifier-dot notation.
 * Designed to live inside the filters overlay card (no own background).
 * Includes an expandable help section with natural-language explanations.
 */
export function Legend() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="text-[9px] text-[var(--gray-10)] leading-none">
      <div className="flex items-center gap-x-3 gap-y-1 mb-1 flex-wrap">
        <LegendArc label="AS" variant="as" />
        <LegendArc label="EF" variant="ef" />
        <LegendArc label="EP" variant="ep" />
        <LegendArc label="EF+EP" variant="efep" />
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto text-[var(--gray-8)] hover:text-[var(--gray-10)] transition-colors"
          title="What do these mean?"
        >
          <FaQuestionCircle size={10} />
        </button>
      </div>
      <div className="flex items-center gap-x-3 gap-y-1">
        <LegendDot label="each" quantifier="each" />
        <LegendDot label="any" quantifier="any" />
        <LegendDot label="all" quantifier="all" />
      </div>

      {expanded && (
        <div className="mt-1.5 pt-1.5 border-t border-[var(--gray-4)] text-[8.5px] text-[var(--gray-9)] leading-relaxed space-y-1">
          <p>
            <b className="text-[var(--gray-10)]">AS</b>: Always succeeds: whenever <i>A</i> occurs, <i>B</i>{" "}
            also occurs (and vice versa).
          </p>
          <p>
            <b className="text-[var(--gray-10)]">EF</b>: Eventually follows: whenever <i>A</i> occurs,{" "}
            <i>B</i> eventually occurs later.
          </p>
          <p>
            <b className="text-[var(--gray-10)]">EP</b>: Eventually precedes: whenever <i>B</i> occurs,{" "}
            <i>A</i> must have occurred before.
          </p>
          <p>
            <b className="text-[var(--gray-10)]">EF+EP</b>: Both directions: <i>A</i> always leads to <i>B</i>{" "}
            and <i>B</i> always follows <i>A</i>.
          </p>
          <div className="pt-1 border-t border-[var(--gray-4)]">
            <p>
              <b className="text-[var(--gray-10)]">each</b>: constraint holds for each individual object of
              this type.
            </p>
            <p>
              <b className="text-[var(--gray-10)]">any</b>: constraint holds when considering any object of
              this type.
            </p>
            <p>
              <b className="text-[var(--gray-10)]">all</b>: constraint holds when considering all objects of
              this type together.
            </p>
          </div>
          <div className="pt-1 border-t border-[var(--gray-4)]">
            <p>
              Node dots show object-type involvement: a single dot means exactly one object per event,
              multiple dots mean a variable number.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** A miniature arc drawing matching the ConstraintEdge markers. */
function LegendArc({ label, variant }: { label: string; variant: "ef" | "ep" | "as" | "efep" }) {
  const W = 30;
  const H = 8;
  const cy = H / 2;
  const r = 2.2;
  const arrowH = 2.5;
  const arrowW = 4;
  const lx = r; // left circle center
  const rx = W - r; // right endpoint

  return (
    <div className="inline-flex items-center gap-0.5">
      <svg width={W} height={H} style={{ display: "block", overflow: "visible" }} aria-hidden="true">
        {/* Left circle (present on all arc types). */}
        <circle cx={lx} cy={cy} r={r} fill={MARKER} />

        {variant === "as" && <line x1={lx + r} y1={cy} x2={rx} y2={cy} stroke={MARKER} strokeWidth={1.5} />}
        {variant === "ef" && (
          <>
            <line x1={lx + r} y1={cy} x2={rx - arrowW} y2={cy} stroke={MARKER} strokeWidth={1.5} />
            <polygon
              points={`${rx - arrowW},${cy - arrowH} ${rx},${cy} ${rx - arrowW},${cy + arrowH}`}
              fill={MARKER}
            />
          </>
        )}
        {variant === "ep" && (
          <>
            <polygon
              points={`${lx + r + arrowW},${cy - arrowH} ${lx + r},${cy} ${lx + r + arrowW},${cy + arrowH}`}
              fill={MARKER}
            />
            <line x1={lx + r + arrowW} y1={cy} x2={rx - r} y2={cy} stroke={MARKER} strokeWidth={1.5} />
            <circle cx={rx} cy={cy} r={r} fill={MARKER} />
          </>
        )}
        {variant === "efep" && (
          <>
            <line x1={lx + r} y1={cy} x2={rx - arrowW - r} y2={cy} stroke={MARKER} strokeWidth={1.5} />
            <polygon
              points={`${rx - arrowW - r},${cy - arrowH} ${rx - r},${cy} ${rx - arrowW - r},${cy + arrowH}`}
              fill={MARKER}
            />
            <circle cx={rx} cy={cy} r={r} fill={MARKER} />
          </>
        )}
      </svg>
      <span>{label}</span>
    </div>
  );
}

/** A miniature dot showing one of the three quantifier encodings. */
function LegendDot({ label, quantifier }: { label: string; quantifier: "each" | "any" | "all" }) {
  return (
    <div className="inline-flex items-center gap-0.5">
      <MultiDot dot={{ objectType: label, color: "currentColor", quantifier }} />
      <span>{label}</span>
    </div>
  );
}
