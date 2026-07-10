import {
  Editor,
  usePetriLayout,
  buildPetriNetSvg,
  isEnabled,
  type Marking,
  type ArcData,
  type PetriNetNode,
  type TokenMark,
} from "@r4pm/components/petri";
import type { Edge } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyOverlay,
  baseElements,
  normalizePetriNet,
  type PetriNet,
  type PetriNetOverlay,
} from "./petri-net";
import { colorForSeed, useViewerConfig, type ViewerProps } from "./viewer/viewer-config";
import { useRegisterExport, type VectorExportSource } from "./viewer/export";
import { ActivitySequence } from "./shared/ActivitySequence";
import { Badge, Button, ConfirmButton, IconButton } from "@r4pm/components/ui";

/** One fired step of a simulation trace. */
export interface SimTraceStep {
  transitionId: string;
  /** Transition label; null for a silent (tau) transition. */
  label: string | null;
}

/** A replay trace plus token-replay bookkeeping (produced/consumed/missing/remaining). */
export interface SimTrace {
  steps: SimTraceStep[];
  /** Whether the marking was accepting (final marking reached) when the trace ended. */
  accepting: boolean;
  /** Tokens produced: initial marking plus every fired transition's output weights. */
  produced: number;
  /** Tokens consumed: every fired transition's input weights plus the final marking. */
  consumed: number;
  /** Tokens that had to be created to fire (input shortfall on a forced fire, plus any
   *  final-marking shortfall at trace end). */
  missing: number;
  /** Tokens left in the marking after consuming the final marking, at trace end. */
  remaining: number;
}

const SILENT = "τ";

const ENABLED_RING = "0 0 0 2px #16a34a";
// Amber ring marks a not-enabled transition that can still be force-fired (token replay).
const FORCED_RING = "0 0 0 2px #f59e0b";

const sumTokens = (m: Marking) => Object.values(m).reduce((a, b) => a + b, 0);

/** Replay-fire a transition from marking `m`, allowing it even when not enabled: every input
 *  weight is consumed (any shortfall counted as `missing`) and every output weight produced.
 *  Input/output weights are aggregated per place against the original marking first, so a
 *  self-loop (p->t and t->p) consumes then produces one token regardless of arc order. */
function replayFire(
  net: PetriNet,
  m: Marking,
  transitionId: string,
): { next: Marking; produced: number; consumed: number; missing: number } {
  const placeIds = new Set(net.places.map((p) => p.id));
  const inWeight: Record<string, number> = {};
  const outWeight: Record<string, number> = {};
  let produced = 0;
  let consumed = 0;
  for (const a of net.arcs) {
    const [from, to] = a.nodes;
    const weight = a.weight ?? 1;
    if (to === transitionId && placeIds.has(from)) {
      inWeight[from] = (inWeight[from] ?? 0) + weight;
      consumed += weight;
    }
    if (from === transitionId && placeIds.has(to)) {
      outWeight[to] = (outWeight[to] ?? 0) + weight;
      produced += weight;
    }
  }

  const next: Marking = { ...m };
  let missing = 0;
  for (const place of new Set([...Object.keys(inWeight), ...Object.keys(outWeight)])) {
    const have = m[place] ?? 0;
    const consume = inWeight[place] ?? 0;
    const produce = outWeight[place] ?? 0;
    if (consume > have) missing += consume - have;
    next[place] = Math.max(0, have - consume) + produce;
  }
  return { next, produced, consumed, missing };
}

/** Consume the final marking at end-of-trace: adds each final token to `consumed`, counts any
 *  shortfall as `missing`, and returns the tokens left over across all places as `remaining`. */
function finalReplay(net: PetriNet, m: Marking): { consumed: number; missing: number; remaining: number } {
  const final = net.final_marking ?? {};
  const ids = new Set<string>([...net.places.map((p) => p.id), ...Object.keys(m), ...Object.keys(final)]);
  let consumed = 0;
  let missing = 0;
  let remaining = 0;
  for (const id of ids) {
    const have = m[id] ?? 0;
    const need = final[id] ?? 0;
    consumed += need;
    if (need > have) missing += need - have;
    remaining += Math.max(0, have - need);
  }
  return { consumed, missing, remaining };
}

/**
 * Readonly Petri net where clicking an enabled transition fires it: consume input
 * tokens, produce output tokens. Tokens are indistinguishable counts.
 */
export interface PetriNetSimulatorProps extends ViewerProps<PetriNet> {
  /** When provided, a "Save as log" button appears; called with every recorded trace
   *  (the current one finalized) so a host can turn them into an event-log dataset with
   *  one case per trace. Kept out of the pure component. */
  onSaveAsLog?: (traces: SimTrace[]) => void;
  /** When true, clicking a not-enabled transition force-fires it (token-replay style): the
   *  missing input tokens are counted into the trace and firing proceeds anyway. Default false. */
  allowForcedFiring?: boolean;
}

export function PetriNetSimulator(props: PetriNetSimulatorProps) {
  const { data, onSaveAsLog, allowForcedFiring } = props;
  const cfg = useViewerConfig(props);
  // Accept the client record shape too (studio casts rather than converts).
  const net = useMemo(() => normalizePetriNet(data), [data]);
  const initial = useMemo<Marking>(() => ({ ...(net.initial_marking ?? {}) }), [net]);
  const [marking, setMarking] = useState<Marking>(initial);
  const freshTrace = useCallback(
    (): SimTrace => ({
      steps: [],
      accepting: false,
      produced: sumTokens(initial),
      consumed: 0,
      missing: 0,
      remaining: 0,
    }),
    [initial],
  );
  const [traces, setTraces] = useState<SimTrace[]>(() => [freshTrace()]);
  const active = traces[traces.length - 1];
  // Already-closed traces, shown as read-only rows above the one being built.
  const committed = traces.slice(0, -1);
  const activityColor = (a: string) =>
    a === SILENT ? "#9ca3af" : (cfg.colorOf?.("activity", a) ?? colorForSeed(a));
  const [base, setBase] = useState<{ nodes: PetriNetNode[]; edges: Edge<ArcData>[] }>({
    nodes: [],
    edges: [],
  });

  const reset = () => {
    setMarking(initial);
    setTraces([freshTrace()]);
  };
  useEffect(() => {
    setMarking(initial);
    setTraces([freshTrace()]);
  }, [initial, freshTrace]);

  // Accepting = marking equals the final marking exactly (no extra tokens anywhere);
  // deadlock = no transition is enabled.
  const status = useMemo(() => {
    const final = net.final_marking ?? {};
    const ids = new Set<string>([
      ...net.places.map((p) => p.id),
      ...Object.keys(final),
      ...Object.keys(marking),
    ]);
    let matchesFinal = true;
    for (const id of ids) {
      if ((marking[id] ?? 0) !== (final[id] ?? 0)) {
        matchesFinal = false;
        break;
      }
    }
    const hasFinal = Object.values(final).some((v) => v > 0);
    const deadlock = !net.transitions.some((t) => isEnabled(net, marking, t.id));
    return { accepting: matchesFinal && hasFinal, deadlock };
  }, [net, marking]);

  // Close the current trace: consume the final marking (adding to consumed, counting any
  // shortfall as missing), record the tokens left over as remaining, and snapshot the accepting
  // status at end-of-trace. Returns the list with its last entry finalized.
  const finalizeActive = (list: SimTrace[]): SimTrace[] => {
    const i = list.length - 1;
    const cur = list[i];
    const fin = finalReplay(net, marking);
    const finalized: SimTrace = {
      ...cur,
      consumed: cur.consumed + fin.consumed,
      missing: cur.missing + fin.missing,
      remaining: fin.remaining,
      accepting: status.accepting,
    };
    return [...list.slice(0, i), finalized];
  };

  // Finalize the current trace and start a fresh empty one from the initial marking.
  const startNewTrace = () => {
    setTraces((all) => [...finalizeActive(all), freshTrace()]);
    setMarking(initial);
  };

  // Drop a saved (committed) trace; the active trace (last) is never removed here.
  const deleteTrace = (index: number) => {
    setTraces((all) => {
      if (index < 0 || index >= all.length - 1) return all;
      return all.filter((_, i) => i !== index);
    });
  };

  // Discard the in-progress trace only (keeps saved ones); resets the marking.
  const discardCurrent = () => {
    setTraces((all) => [...all.slice(0, -1), freshTrace()]);
    setMarking(initial);
  };

  // All non-empty traces with the current one finalized; what "Save as log" exports.
  const exportTraces = () => finalizeActive(traces).filter((t) => t.steps.length > 0);
  const hasRecordedTrace = traces.some((t) => t.steps.length > 0);

  const petriLayout = usePetriLayout();
  useEffect(() => {
    let cancelled = false;
    const { nodes, edges } = baseElements(net);
    petriLayout(nodes, edges).then((res) => {
      if (!cancelled) setBase(res);
    });
    return () => {
      cancelled = true;
    };
  }, [net, petriLayout]);

  const overlay = useMemo<PetriNetOverlay>(
    () => ({
      transition: (t) => {
        const enabled = isEnabled(net, marking, t.id);
        // Not enabled and forced firing off: dim and inert.
        if (!enabled && !allowForcedFiring) return { style: { opacity: 0.4 } };
        return {
          style: enabled
            ? { cursor: "pointer", boxShadow: ENABLED_RING }
            : { cursor: "pointer", boxShadow: FORCED_RING, opacity: 0.6 },
          onClick: () => {
            const { next, produced, consumed, missing } = replayFire(net, marking, t.id);
            setMarking(next);
            setTraces((all) => {
              const i = all.length - 1;
              const cur = all[i];
              const updated: SimTrace = {
                ...cur,
                steps: [...cur.steps, { transitionId: t.id, label: t.label }],
                produced: cur.produced + produced,
                consumed: cur.consumed + consumed,
                missing: cur.missing + missing,
              };
              return [...all.slice(0, i), updated];
            });
          },
        };
      },
      place: (p) => {
        const cur = marking[p.id] ?? 0;
        const goal = p.finalTokens;
        const reached = Math.min(cur, goal);
        const extra = Math.max(0, cur - goal);
        const unreached = Math.max(0, goal - cur);
        // tokenMarks rather than JSX so these also render in the SVG export.
        const marks: TokenMark[] = [
          ...Array.from({ length: reached }, () => ({
            shape: "square" as const,
            color: "#16a34a",
            title: "final marking reached",
          })),
          ...Array.from({ length: extra }, () => ({ shape: "dot" as const })),
          ...Array.from({ length: unreached }, () => ({
            shape: "square" as const,
            opacity: 0.2,
            title: "final marking (target)",
          })),
        ];
        return { tokenMarks: marks };
      },
    }),
    [net, marking, allowForcedFiring],
  );

  const display = useMemo(() => applyOverlay(base, net, overlay), [base, net, overlay]);

  const displayRef = useRef(display);
  displayRef.current = display;
  const exportSource = useMemo<VectorExportSource>(
    () => ({ toSvg: () => buildPetriNetSvg(displayRef.current.nodes, displayRef.current.edges) }),
    [],
  );
  useRegisterExport("petri-net", exportSource);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 256 }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <Editor
          readOnly
          showExportControls={false}
          nodes={display.nodes}
          edges={display.edges}
          editorProps={{ nodesDraggable: false, zoomOnDoubleClick: false }}
        />
      </div>
      <div
        className="bg-(--color-panel-translucent) backdrop-blur-sm"
        style={{
          position: "absolute",
          left: 8,
          right: 48,
          bottom: 8,
          zIndex: 6,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: "5px 6px",
          borderRadius: 8,
          border: "1px solid var(--gray-a5)",
        }}
      >
        {committed.length > 0 && (
          <div
            className=" overflow-y-auto pr-2"
            style={{
              minWidth: 0,
              maxHeight: 96,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 3,
              paddingBottom: 4,
              borderBottom: "1px solid var(--gray-a5)",
            }}
          >
            {committed.map((t, i) => (
              <div
                className="overflow-hidden shrink-0"
                key={i}
                style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}
              >
                <span style={{ fontSize: 10, color: "var(--gray-9)", flexShrink: 0, width: 18 }}>
                  #{i + 1}
                </span>
                <div className="min-w-0 flex-1 [&>div]:flex-nowrap overflow-x-auto">
                  <ActivitySequence
                    activities={t.steps.map((s) => (s.label?.trim() ? s.label : SILENT))}
                    colorOf={activityColor}
                  />
                </div>
                {t.accepting && (
                  <Badge
                    color="green"
                    variant="surface"
                    size="1"
                    title="Ended in the final marking"
                    style={{ flexShrink: 0 }}
                  >
                    Acc
                  </Badge>
                )}
                <span
                  style={{ fontSize: 10, color: "var(--gray-9)", flexShrink: 0 }}
                  title="produced / consumed / missing / remaining tokens"
                >
                  {t.produced}p/{t.consumed}c/{t.missing}m/{t.remaining}r
                </span>
                <IconButton
                  variant="ghost"
                  color="red"
                  size="1"
                  title="Delete this trace"
                  onClick={() => deleteTrace(i)}
                  style={{ flexShrink: 0 }}
                >
                  ✕
                </IconButton>
              </div>
            ))}
          </div>
        )}
        <div
          className="flex items-center justify-between"
          style={{
            minWidth: 0,
            maxHeight: 88,
            overflowY: "auto",
            display: "flex",
            alignItems: "center",
            minHeight: 24,
          }}
        >
          {active.steps.length === 0 ? (
            <span style={{ fontSize: 11, color: "var(--gray-9)" }}>
              Click an enabled transition to build a trace
            </span>
          ) : (
            <ActivitySequence
              activities={active.steps.map((s) => (s.label?.trim() ? s.label : SILENT))}
              colorOf={activityColor}
            />
          )}
          <div className="flex items-center gap-x-2">
            {status.accepting && (
              <Badge color="green" variant="surface" title="Final marking reached, no other tokens">
                Accepting
              </Badge>
            )}
            {status.deadlock && !status.accepting && (
              <Badge color="red" title="No enabled transition">
                Deadlock
              </Badge>
            )}
            <span style={{ fontSize: 10, color: "var(--gray-9)", flexShrink: 0 }}>
              {traces.length > 1 ? `${traces.length} traces, ` : ""}
              {active.steps.length} step{active.steps.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, minWidth: 0 }}>
            <Button
              variant="soft"
              size="2"
              disabled={active.steps.length === 0}
              title="Finish this trace and start a new one from the initial marking"
              onClick={startNewTrace}
            >
              New trace
            </Button>
            <Button
              variant="soft"
              color="red"
              size="1"
              disabled={active.steps.length === 0}
              title="Discard the current trace (keeps saved ones)"
              onClick={discardCurrent}
            >
              Discard
            </Button>
          </div>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              flexShrink: 0,
            }}
          >
            <ConfirmButton
              color="red"
              size="1"
              title="Clear all traces and reset to the initial marking"
              message="Reset clears all traces and returns to the initial marking. Continue?"
              confirmLabel="Reset"
              onConfirm={reset}
            >
              Reset
            </ConfirmButton>
            {onSaveAsLog && (
              <Button
                variant="soft"
                size="1"
                disabled={!hasRecordedTrace}
                title="Create an event log dataset from every recorded trace"
                onClick={() => onSaveAsLog(exportTraces())}
              >
                Save as log
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
