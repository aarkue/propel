import { type EdgeTemplate, TEMPLATE_TO_ARC } from "../model";

const W = 64;
const H = 22;
const CY = H / 2;
const R = 4.3;
const LX = 7;
const RX = W - 6;

/** A wide source-circle -> arc -> marker glyph matching the canvas edge; negated templates overlay a red slash. */
export function ArcGlyph({ template }: { template: EdgeTemplate }) {
  const { arc_type, negated } = TEMPLATE_TO_ARC[template];
  const reversed = arc_type === "EP" || arc_type === "DP";
  const direct = arc_type === "DF" || arc_type === "DP";
  const forward = arc_type === "EF" || arc_type === "DF";

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none" aria-hidden="true">
      <line x1={LX} y1={CY} x2={RX} y2={CY} stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
      <circle cx={LX} cy={CY} r={R} fill="currentColor" />
      {forward && (
        <polygon points={`${RX - 9},${CY - 5} ${RX},${CY} ${RX - 9},${CY + 5}`} fill="currentColor" />
      )}
      {direct && !reversed && (
        <rect x={RX - 13} y={CY - 6} width={2.4} height={12} rx={0.6} fill="currentColor" />
      )}
      {reversed && (
        <polygon points={`${LX + 6},${CY} ${LX + 15},${CY - 5} ${LX + 15},${CY + 5}`} fill="currentColor" />
      )}
      {direct && reversed && (
        <rect x={LX + 16} y={CY - 6} width={2.4} height={12} rx={0.6} fill="currentColor" />
      )}
      {negated && (
        <g stroke="var(--red-9)" strokeWidth={1.9} strokeLinecap="round">
          <line x1={W / 2 - 5} y1={CY + 6} x2={W / 2} y2={CY - 6} />
          <line x1={W / 2} y1={CY + 6} x2={W / 2 + 5} y2={CY - 6} />
        </g>
      )}
    </svg>
  );
}
