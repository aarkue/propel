import {
  Editor,
  usePetriLayout,
  buildPetriNetSvg,
  fireOcpnDetailed,
  isOcpnEnabled,
  type OcpnFireGuard,
  type OcpnFiring,
  type TokenMarking,
  type ArcData,
  type PetriNetNode,
} from "@r4pm/components/petri";
import type { Edge } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { applyOverlay, baseElements, normalizePetriNet, type PetriNetOverlay } from "./petri-net";
import type { ObjectCentricPetriNet } from "./object-centric-petri-net";
import { shadeHex } from "./dfg/util/colors";
import { colorForSeed, useViewerConfig, type ViewerProps } from "./viewer/viewer-config";
import { useRegisterExport, type VectorExportSource } from "./viewer/export";
import {
  ObjectCentricSequence,
  type OcSequenceObject,
  type OcSequenceStep,
} from "./shared/ObjectCentricSequence";
import { Button } from "@r4pm/components/ui";

const ENABLED_RING = "0 0 0 2px #16a34a";

/** The objects a firing touched: consumed + produced token ids, deduped, tagged by the
 *  object type of their place. */
function firingObjects(ocpn: ObjectCentricPetriNet, firing: OcpnFiring): OcSequenceObject[] {
  const typeById = new Map<string, string>();
  for (const rec of [firing.consume, firing.produce]) {
    for (const [place, ids] of Object.entries(rec)) {
      const ot = ocpn.place_object_type[place] ?? "";
      for (const id of ids) typeById.set(id, ot);
    }
  }
  return [...typeById].map(([id, objectType]) => ({ id, objectType }));
}

export interface ObjectCentricPetriNetSimulatorProps extends ViewerProps<ObjectCentricPetriNet> {
  /** Decide which tokens fire together; defaults to consume-all on variable arcs. */
  fire?: OcpnFireGuard;
  /** Explicit, meaningful initial token ids per place (overrides generated ids). */
  initialTokens?: Record<string, string[]>;
  /** Render a single token; defaults to a colored dot with a short id + tooltip. */
  renderToken?: (id: string, objectType: string) => ReactNode;
  /** When provided, a "Save as OCEL" button appears; called with the current trace so a host
   *  can turn it into an object-centric event log. Kept out of the pure component. */
  onSaveAsLog?: (trace: OcSequenceStep[]) => void;
}

function seedMarking(ocpn: ObjectCentricPetriNet, explicit?: Record<string, string[]>): TokenMarking {
  if (explicit) return { ...explicit };
  const out: TokenMarking = {};
  for (const [place, count] of Object.entries(ocpn.petri_net.initial_marking ?? {})) {
    out[place] = Array.from({ length: count }, (_, i) => `${place}#${i}`);
  }
  return out;
}

const shortId = (id: string): string => {
  const i = id.lastIndexOf("#");
  return i >= 0 ? id.slice(i + 1) : id.slice(0, 3);
};

function isVariable(ocpn: ObjectCentricPetriNet, from: string, to: string): boolean {
  const place = ocpn.petri_net.places.find((p) => p.id === from || p.id === to)?.id;
  if (!place) return false;
  const trans = to === place ? from : to;
  const m = ocpn.place_in_out_mult?.[place];
  if (!m) return false;
  const [inc, out] = m;
  return from === place ? !!out[trans] : !!inc[trans];
}

/**
 * Readonly object-centric Petri net where clicking an enabled transition fires it.
 * Tokens carry ids (object instances); variable arcs consume all tokens by default,
 * overridable via the `fire` guard.
 */
export function ObjectCentricPetriNetSimulator(props: ObjectCentricPetriNetSimulatorProps) {
  const { data, fire, initialTokens, renderToken, onSaveAsLog } = props;
  const cfg = useViewerConfig(props);
  const colorOf = useCallback(
    (ot: string, mode: "normal" | "foreground" | "light" = "normal") =>
      shadeHex(cfg.colorOf?.("objectType", ot) ?? "#888888", mode),
    [cfg.colorOf],
  );

  // Normalize the inner net to array shape (studio passes the client record shape).
  const ocpn = useMemo(() => ({ ...data, petri_net: normalizePetriNet(data.petri_net) }), [data]);

  const initial = useMemo(() => seedMarking(ocpn, initialTokens), [ocpn, initialTokens]);
  const [marking, setMarking] = useState<TokenMarking>(initial);
  const [trace, setTrace] = useState<OcSequenceStep[]>([]);
  const [base, setBase] = useState<{ nodes: PetriNetNode[]; edges: Edge<ArcData>[] }>({
    nodes: [],
    edges: [],
  });

  const reset = useCallback(() => {
    setMarking(initial);
    setTrace([]);
  }, [initial]);
  useEffect(() => {
    setMarking(initial);
    setTrace([]);
  }, [initial]);

  const labelOf = useCallback(
    (transitionId: string): string | null =>
      ocpn.petri_net.transitions.find((t) => t.id === transitionId)?.label ?? null,
    [ocpn],
  );

  const petriLayout = usePetriLayout();
  useEffect(() => {
    let cancelled = false;
    const { nodes, edges } = baseElements(ocpn.petri_net);
    petriLayout(nodes, edges).then((res) => {
      if (!cancelled) setBase(res);
    });
    return () => {
      cancelled = true;
    };
  }, [ocpn, petriLayout]);

  const typeOf = useCallback((placeId: string): string => ocpn.place_object_type[placeId] ?? "", [ocpn]);

  const overlay = useMemo<PetriNetOverlay>(
    () => ({
      transition: (t) => {
        const enabled = isOcpnEnabled(ocpn, marking, t.id, fire);
        return enabled
          ? {
              style: { cursor: "pointer", boxShadow: ENABLED_RING },
              onClick: () => {
                const res = fireOcpnDetailed(ocpn, marking, t.id, { guard: fire });
                if (!res) return;
                setMarking(res.marking);
                setTrace((tr) => [
                  ...tr,
                  { transitionId: t.id, label: labelOf(t.id), objects: firingObjects(ocpn, res.firing) },
                ]);
              },
            }
          : { style: { opacity: 0.4 } };
      },
      place: (p) => {
        const ot = typeOf(p.id);
        const ids: string[] = marking[p.id] ?? [];
        return {
          label: ot,
          style: { borderColor: colorOf(ot), borderWidth: 3, background: colorOf(ot, "light") },
          renderMarking: () => (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 2,
                justifyContent: "center",
                alignItems: "center",
                maxWidth: 44,
              }}
            >
              {ids.map((id) =>
                renderToken ? (
                  <span key={id}>{renderToken(id, ot)}</span>
                ) : (
                  <span
                    key={id}
                    title={id}
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "100%",
                      background: colorOf(ot, "foreground"),
                      color: "#fff",
                      fontSize: 8,
                      fontFamily: "monospace",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {shortId(id)}
                  </span>
                ),
              )}
            </div>
          ),
        };
      },
      arc: (a) => {
        const place = ocpn.petri_net.places.find((p) => p.id === a.from || p.id === a.to)?.id;
        const ot = place ? typeOf(place) : "";
        const variable = isVariable(ocpn, a.from, a.to);
        return {
          style: {
            stroke: colorOf(ot),
            strokeWidth: variable ? 4 : 2,
            strokeDasharray: variable ? "6 3" : undefined,
          },
        };
      },
    }),
    [marking, fire, colorOf, renderToken, typeOf, labelOf, ocpn],
  );

  const display = useMemo(() => applyOverlay(base, ocpn.petri_net, overlay), [base, ocpn, overlay]);

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
        <div
          style={{ maxHeight: 150, overflowY: "auto", display: "flex", alignItems: "center", minHeight: 24 }}
        >
          {trace.length === 0 ? (
            <span style={{ fontSize: 11, color: "var(--gray-9)" }}>
              Click an enabled transition to build a trace
            </span>
          ) : (
            <ObjectCentricSequence
              steps={trace}
              colorOf={(ot) => colorOf(ot)}
              activityColorOf={(a) => cfg.colorOf?.("activity", a) ?? colorForSeed(a)}
            />
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Button variant="soft" size="1" onClick={reset}>
            Reset
          </Button>
          {onSaveAsLog && (
            <Button
              variant="soft"
              size="1"
              disabled={trace.length === 0}
              title="Create an object-centric event log from this trace"
              onClick={() => onSaveAsLog(trace)}
            >
              Save as OCEL
            </Button>
          )}
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--gray-9)", flexShrink: 0 }}>
            {trace.length} step{trace.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </div>
  );
}
