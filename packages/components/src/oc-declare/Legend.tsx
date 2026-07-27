import { useState } from "react";
import { FaQuestionCircle } from "react-icons/fa";
import { MultiDot } from "./MultiDot";

/** Use currentColor so legend arcs/dots inherit from the surrounding text. */
const MARKER = "currentColor";

/** Compact legend for arc types + quantifier dots with expandable help; `showCombined` merges EF+EP/DF+DP (editor passes false), `usedArcTypes` filters to what's in use. */
export function Legend({
  showCombined = true,
  usedArcTypes,
}: {
  showCombined?: boolean;
  usedArcTypes?: ReadonlySet<string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const has = (t: string) => !usedArcTypes || usedArcTypes.has(t);
  // Relevant when a collapsed arc exists, or both raw directions occur (viewer may merge them).
  const showEfEp = showCombined && (has("EFEP") || (has("EF") && has("EP")));
  const showDfDp =
    showCombined &&
    usedArcTypes !== undefined &&
    (usedArcTypes.has("DFDP") || (usedArcTypes.has("DF") && usedArcTypes.has("DP")));

  return (
    <div className="text-[9px] text-[var(--gray-10)] leading-none">
      <div className="flex items-center gap-x-3 gap-y-1 mb-1 flex-wrap">
        {has("AS") && <LegendArc label="AS" variant="as" />}
        {has("EF") && <LegendArc label="EF" variant="ef" />}
        {has("EP") && <LegendArc label="EP" variant="ep" />}
        {showEfEp && <LegendArc label="EF+EP" variant="efep" />}
        {has("DF") && <LegendArc label="DF" variant="df" />}
        {has("DP") && <LegendArc label="DP" variant="dp" />}
        {showDfDp && <LegendArc label="DF+DP" variant="dfdp" />}
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
      <div className="flex items-center gap-x-3 gap-y-1 mt-1 flex-wrap">
        <LegendCard label="1..1" card="1..1" />
        <LegendCard label="0..1" card="0..1" />
        <LegendCard label="1..*" card="1..*" />
        <LegendCard label="0..*" card="0..*" />
      </div>

      {expanded && (
        <div className="mt-1.5 pt-1.5 border-t border-[var(--gray-4)] text-[8.5px] text-[var(--gray-9)] leading-relaxed space-y-1">
          {has("AS") && (
            <p>
              <b className="text-[var(--gray-10)]">AS</b>: Always succeeds: whenever <i>A</i> occurs, <i>B</i>{" "}
              also occurs (and vice versa).
            </p>
          )}
          {has("EF") && (
            <p>
              <b className="text-[var(--gray-10)]">EF</b>: Eventually follows: whenever <i>A</i> occurs,{" "}
              <i>B</i> eventually occurs later.
            </p>
          )}
          {has("EP") && (
            <p>
              <b className="text-[var(--gray-10)]">EP</b>: Eventually precedes: whenever <i>B</i> occurs,{" "}
              <i>A</i> must have occurred before.
            </p>
          )}
          {showEfEp && (
            <p>
              <b className="text-[var(--gray-10)]">EF+EP</b>: Both directions: <i>A</i> always leads to{" "}
              <i>B</i> and <i>B</i> always follows <i>A</i>.
            </p>
          )}
          {has("DF") && (
            <p>
              <b className="text-[var(--gray-10)]">DF</b>: Directly follows: whenever <i>A</i> occurs,{" "}
              <i>B</i> occurs directly after (no other event in between).
            </p>
          )}
          {has("DP") && (
            <p>
              <b className="text-[var(--gray-10)]">DP</b>: Directly precedes: whenever <i>B</i> occurs,{" "}
              <i>A</i> occurred directly before (no other event in between).
            </p>
          )}
          {showDfDp && (
            <p>
              <b className="text-[var(--gray-10)]">DF+DP</b>: Both directions, directly: <i>A</i> and <i>B</i>{" "}
              occur back-to-back with nothing in between.
            </p>
          )}
          <div className="pt-1 border-t border-[var(--gray-4)]">
            <p>
              <b className="text-[var(--gray-10)]">each</b>: for each involved object of this type separately,
              there are the required target events involving it
            </p>
            <p>
              <b className="text-[var(--gray-10)]">any</b>: target event shares at least one object of this
              type
            </p>
            <p>
              <b className="text-[var(--gray-10)]">all</b>: all object of this type involved in the source
              event must also be involved in the target event
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

type ArcVariant = "as" | "ef" | "ep" | "efep" | "df" | "dp" | "dfdp";

/** A miniature arc drawing matching the ConstraintEdge markers' proportions, on a short stub of line. */
function LegendArc({ label, variant }: { label: string; variant: ArcVariant }) {
  const W = 22;
  const H = 12;
  const cy = H / 2;
  const r = 2.5; // dot radius
  const arrowH = 4.5; // arrowhead half-height
  const arrowW = 4.5; // arrowhead depth
  const barW = 1.5; // DF/DP "direct" bar width
  const sw = 2; // stroke width
  const lx = r; // left circle center
  const rx = W; // right endpoint

  // Right-pointing arrowhead with its tip at `tip`, optionally with the DF/DP bar behind it.
  const arrowRight = (tip: number, bar: boolean) => (
    <>
      {bar && (
        <rect x={tip - arrowW - barW - 1} y={cy - arrowH} width={barW} height={arrowH * 2} fill={MARKER} />
      )}
      <polygon
        points={`${tip - arrowW},${cy - arrowH} ${tip},${cy} ${tip - arrowW},${cy + arrowH}`}
        fill={MARKER}
      />
    </>
  );
  // Left-pointing arrowhead with its tip at `tip` (EP/DP start: points into the source dot).
  const arrowLeft = (tip: number, bar: boolean) => (
    <>
      <polygon
        points={`${tip + arrowW},${cy - arrowH} ${tip},${cy} ${tip + arrowW},${cy + arrowH}`}
        fill={MARKER}
      />
      {bar && <rect x={tip + arrowW + 1} y={cy - arrowH} width={barW} height={arrowH * 2} fill={MARKER} />}
    </>
  );

  return (
    <div className="inline-flex items-center gap-0.5">
      <svg width={W} height={H} style={{ display: "block", overflow: "visible" }} aria-hidden="true">
        {/* Line first, markers drawn on top (like the real edge). */}
        <line
          x1={lx}
          y1={cy}
          x2={rx - (variant === "ep" || variant === "dp" || variant === "efep" || variant === "dfdp" ? r : 0)}
          y2={cy}
          stroke={MARKER}
          strokeWidth={sw}
        />
        {/* Left circle (present on all arc types). */}
        <circle cx={lx} cy={cy} r={r} fill={MARKER} />

        {variant === "ef" && arrowRight(rx, false)}
        {variant === "df" && arrowRight(rx, true)}
        {(variant === "ep" || variant === "dp") && (
          <>
            {arrowLeft(lx + r + 1, variant === "dp")}
            <circle cx={rx - r} cy={cy} r={r} fill={MARKER} />
          </>
        )}
        {(variant === "efep" || variant === "dfdp") && (
          <>
            {arrowRight(rx - 2 * r, variant === "dfdp")}
            <circle cx={rx - r} cy={cy} r={r} fill={MARKER} />
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

/** A miniature dot showing an involvement cardinality class (dashed = optional). */
function LegendCard({ label, card }: { label: string; card: "0..1" | "0..*" | "1..1" | "1..*" }) {
  return (
    <div className="inline-flex items-center gap-0.5">
      <MultiDot dot={{ objectType: label, color: "currentColor", card }} />
      <span>{label}</span>
    </div>
  );
}
