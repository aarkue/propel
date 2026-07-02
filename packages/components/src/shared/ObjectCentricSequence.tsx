import type { CSSProperties, ReactNode } from "react";
import { useMemo } from "react";
import { softBadgeStyle } from "../dfg/util/colors";
import { useColorOf } from "../viewer/viewer-config";
const SILENT = "τ";
const SILENT_COLOR = "#9ca3af";

// Each step is one clipped shape: a chevron header (inward notch on the left, pointed arrow
// on the right) merging into a body rectangle below. The body is inset by the chevron depth
// on both sides so it sits symmetric under the header (and the arrow is a real point); one
// element, so the body never bleeds through the notch/arrow cutouts.
const STEP_HEAD_PX = 21;
const STEP_CHEV_PX = 7;
const STEP_CLIP =
  "polygon(0 0, calc(100% - var(--chev)) 0, 100% calc(var(--head) / 2), calc(100% - var(--chev)) var(--head), calc(100% - var(--chev)) 100%, var(--chev) 100%, var(--chev) var(--head), 0 var(--head), var(--chev) calc(var(--head) / 2))";

/** One object instance involved in a firing, e.g. a token id paired with its object type. */
export interface OcSequenceObject {
  id: string;
  objectType: string;
}

/** One step of an object-centric simulation trace: a fired transition plus the object
 *  instances it touched. Objects are clustered and colored by type when rendered. */
export interface OcSequenceStep {
  transitionId: string;
  /** Activity label; null or empty for a silent (tau) transition. */
  label: string | null;
  /** Objects associated with this step (any number of types). */
  objects: OcSequenceObject[];
}

export interface ObjectCentricSequenceProps {
  steps: OcSequenceStep[];
  /** Object type -> color (hex). Defaults to the ambient `ViewerConfig` colorOf
   *  (scope "objectType"), falling back to a stable hashed palette. */
  colorOf?: (objectType: string) => string;
  /** Activity name -> chevron-chip color. Defaults to the ambient `ViewerConfig` colorOf
   *  (scope "activity"), falling back to a stable hashed palette. */
  activityColorOf?: (activity: string) => string;
  /** Render a single object chip instead of the default colored pill. */
  renderObject?: (obj: OcSequenceObject, color: string) => ReactNode;
  /** Show the object-type legend above the sequence. Default true. */
  showLegend?: boolean;
  /** Shown when there are no steps yet. */
  emptyLabel?: ReactNode;
}

/** Trailing segment after the last `#`, else a short prefix; keeps long token ids legible. */
function shortId(id: string): string {
  const i = id.lastIndexOf("#");
  return i >= 0 ? id.slice(i + 1) : id.length > 6 ? id.slice(0, 6) : id;
}

/** Distinct object types across all steps, in first-seen order. */
function distinctTypes(steps: OcSequenceStep[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const step of steps) {
    for (const o of step.objects) {
      if (!seen.has(o.objectType)) {
        seen.add(o.objectType);
        out.push(o.objectType);
      }
    }
  }
  return out;
}

function ObjectChip({ obj, color }: { obj: OcSequenceObject; color: string }) {
  return (
    <span
      title={`${obj.id} · ${obj.objectType}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        maxWidth: 72,
        padding: "0 4px 0 3px",
        borderRadius: 999,
        fontSize: 9,
        fontFamily: "monospace",
        fontWeight: 600,
        lineHeight: 1.4,
        // color-mix against Canvas/CanvasText so the tint adapts to light/dark.
        ...softBadgeStyle(color),
        border: `1px solid color-mix(in srgb, ${color} 50%, Canvas)`,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {shortId(obj.id)}
      </span>
    </span>
  );
}

/**
 * Horizontal object-centric trace: a run of fired transitions where each step carries a
 * set of object instances, clustered and colored by object type. The object-centric
 * analogue of {@link ActivitySequence} (which has no per-step objects).
 */
export function ObjectCentricSequence({
  steps,
  colorOf,
  activityColorOf,
  renderObject,
  showLegend = true,
  emptyLabel = "No steps yet",
}: ObjectCentricSequenceProps) {
  const ambientObject = useColorOf("objectType");
  const ambientActivity = useColorOf("activity");
  const objectColor = colorOf ?? ambientObject;
  const activityColor = activityColorOf ?? ambientActivity;
  const types = useMemo(() => distinctTypes(steps), [steps]);
  const typeRank = useMemo(() => new Map(types.map((t, i) => [t, i])), [types]);

  if (steps.length === 0) {
    return <span style={{ fontSize: 11, color: "var(--gray-9)" }}>{emptyLabel}</span>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      {showLegend && types.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {types.map((t) => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11 }}>
              <span
                style={{ width: 10, height: 10, borderRadius: 3, background: objectColor(t), flexShrink: 0 }}
              />
              <span style={{ color: "var(--gray-11)" }}>{t}</span>
            </span>
          ))}
        </div>
      )}

      {/* Each step: a solid chevron header (activity) over a faint body rectangle (objects),
          cut from one shape so the body meets the chevron's bottom endpoints without bleeding
          through its notch/arrow cutouts. */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 4 }}>
        {steps.map((step, i) => {
          const silent = !step.label?.trim();
          const color = silent ? SILENT_COLOR : activityColor(step.label!);
          const headerBg = `color-mix(in srgb, ${color} 26%, Canvas)`;
          const bodyBg = `color-mix(in srgb, ${color} 9%, Canvas)`;
          const objects = [...step.objects].sort(
            (a, b) =>
              (typeRank.get(a.objectType) ?? 0) - (typeRank.get(b.objectType) ?? 0) ||
              a.id.localeCompare(b.id),
          );
          return (
            <div
              key={`${i}-${step.transitionId}`}
              title={silent ? "silent transition" : step.label!}
              style={
                {
                  "--head": `${STEP_HEAD_PX}px`,
                  "--chev": `${STEP_CHEV_PX}px`,
                  clipPath: STEP_CLIP,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  minWidth: 40,
                  maxWidth: 220,
                  background: `linear-gradient(to bottom, ${headerBg} 0, ${headerBg} var(--head), ${bodyBg} var(--head), ${bodyBg} 100%)`,
                } as CSSProperties
              }
            >
              <div
                style={{
                  height: "var(--head)",
                  flexShrink: 0,
                  width: "100%",
                  boxSizing: "border-box",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 calc(var(--chev) + 7px)",
                }}
              >
                <span
                  style={{
                    maxWidth: "100%",
                    fontSize: 11,
                    fontWeight: 700,
                    color: `color-mix(in srgb, ${color} 80%, CanvasText)`,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {silent ? SILENT : step.label}
                </span>
              </div>
              {objects.length > 0 && (
                <div
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 2,
                    justifyContent: "center",
                    padding: "2px calc(var(--chev) + 4px) 4px",
                  }}
                >
                  {objects.map((o) =>
                    renderObject ? (
                      <span key={o.id}>{renderObject(o, objectColor(o.objectType))}</span>
                    ) : (
                      <ObjectChip key={o.id} obj={o} color={objectColor(o.objectType)} />
                    ),
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
