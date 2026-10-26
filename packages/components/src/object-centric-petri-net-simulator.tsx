import {
  Editor,
  fireOcpnDetailed,
  isOcpnEnabled,
  ocpnElementsSvg,
  withGeometryOf,
  type OcpnFireGuard,
  type OcpnFiring,
  type TokenMarking,
  type ArcData,
  type PetriElements,
  type PetriNetNode,
  type PlaceData,
} from "@r4pm/components/petri";
import type { Edge } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Ocpn } from "./viz";
import { layoutOcpn, ocpnOverlays, useOtColor } from "./petri/ocpn-view";
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
function firingObjects(typeOf: Map<string, string>, firing: OcpnFiring): OcSequenceObject[] {
  const typeById = new Map<string, string>();
  for (const rec of [firing.consume, firing.produce]) {
    for (const [place, ids] of Object.entries(rec)) {
      const ot = typeOf.get(place) ?? "";
      for (const id of ids) typeById.set(id, ot);
    }
  }
  return [...typeById].map(([id, objectType]) => ({ id, objectType }));
}

export interface ObjectCentricPetriNetSimulatorProps extends ViewerProps<Ocpn> {
  /** Decide which tokens fire together; defaults to consume-all on variable arcs. */
  fire?: OcpnFireGuard;
  /** Explicit, meaningful initial token ids per place (overrides generated ids). */
  initialTokens?: Record<string, string[]>;
  /** Render a single token; defaults to a colored dot with a short id + tooltip. */
  renderToken?: (id: string, objectType: string) => ReactNode;
  /** When provided, a "Save as OCEL" button appears; called with the current trace so a host
   *  can turn it into an object-centric event log. Kept out of the pure component. */
  onSaveAsLog?: (trace: OcSequenceStep[]) => void;
  /** Export-registry key; override to avoid a collision when multiple viewers share one export frame. */
  exportKey?: string;
}

function seedMarking(ocpn: Ocpn, explicit?: Record<string, string[]>): TokenMarking {
  if (explicit) return { ...explicit };
  const out: TokenMarking = {};
  for (const [place, count] of Object.entries(ocpn.initial_marking)) {
    out[place] = Array.from({ length: count }, (_, i) => `${place}#${i}`);
  }
  return out;
}

const shortId = (id: string): string => {
  const i = id.lastIndexOf("#");
  return i >= 0 ? id.slice(i + 1) : id.slice(0, 3);
};

/**
 * Readonly object-centric Petri net where clicking an enabled transition fires it.
 * Tokens carry ids (object instances); variable arcs consume all tokens by default,
 * overridable via the `fire` guard.
 */
export function ObjectCentricPetriNetSimulator(props: ObjectCentricPetriNetSimulatorProps) {
  const { data: ocpn, fire, initialTokens, renderToken, onSaveAsLog, exportKey } = props;
  const cfg = useViewerConfig(props);
  const { viz } = cfg;
  const otColor = useOtColor(cfg.colorOf);

  const initial = useMemo(() => seedMarking(ocpn, initialTokens), [ocpn, initialTokens]);
  const [marking, setMarking] = useState<TokenMarking>(initial);
  const [trace, setTrace] = useState<OcSequenceStep[]>([]);
  const [base, setBase] = useState<PetriElements>({ nodes: [], edges: [] });

  const reset = useCallback(() => {
    setMarking(initial);
    setTrace([]);
  }, [initial]);
  useEffect(() => {
    setMarking(initial);
    setTrace([]);
  }, [initial]);

  useEffect(() => {
    let cancelled = false;
    layoutOcpn(viz, ocpn)
      .then(({ nodes, edges }) => {
        if (!cancelled) setBase({ nodes, edges });
      })
      .catch((e) => console.error("[ocpn] layout failed:", e));
    return () => {
      cancelled = true;
    };
  }, [ocpn, viz]);
  const keepLayout = useCallback(
    (nodes: PetriNetNode[], edges: Edge<ArcData>[]) => setBase((b) => withGeometryOf(b, { nodes, edges })),
    [],
  );

  const typeOf = useMemo(() => new Map(ocpn.places.map((p) => [p.name, p.object_type])), [ocpn]);
  const labelOf = useMemo(() => new Map(ocpn.transitions.map((t) => [t.name, t.label ?? null])), [ocpn]);

  const { placeOverlay, arcOverlay } = useMemo(() => {
    const overlays = ocpnOverlays(otColor, (id) => typeOf.get(id));
    return {
      arcOverlay: overlays.arcOverlay,
      placeOverlay: (id: string, d: PlaceData): Partial<PlaceData> => {
        const ot = d.objectType ?? "";
        const ids: string[] = marking[id] ?? [];
        return {
          ...overlays.placeOverlay(id, d),
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
              {ids.map((tokenId) =>
                renderToken ? (
                  <span key={tokenId}>{renderToken(tokenId, ot)}</span>
                ) : (
                  <span
                    key={tokenId}
                    title={tokenId}
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "100%",
                      background: otColor(ot, "foreground"),
                      color: "#fff",
                      fontSize: 8,
                      fontFamily: "monospace",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {shortId(tokenId)}
                  </span>
                ),
              )}
            </div>
          ),
        };
      },
    };
  }, [marking, otColor, renderToken, typeOf]);

  // Transitions: enabled ones get a ring and fire on click, the others are dimmed.
  const display = useMemo<PetriElements>(
    () => ({
      edges: base.edges,
      nodes: base.nodes.map((n): PetriNetNode => {
        if (n.type !== "transition") return n;
        if (!isOcpnEnabled(ocpn, marking, n.id, fire))
          return { ...n, data: { ...n.data, elementStyle: { opacity: 0.4 } } };
        return {
          ...n,
          data: {
            ...n.data,
            style: { cursor: "pointer", boxShadow: ENABLED_RING },
            onClick: () => {
              const res = fireOcpnDetailed(ocpn, marking, n.id, { guard: fire });
              if (!res) return;
              setMarking(res.marking);
              setTrace((tr) => [
                ...tr,
                {
                  transitionId: n.id,
                  label: labelOf.get(n.id) ?? null,
                  objects: firingObjects(typeOf, res.firing),
                },
              ]);
            },
          },
        };
      }),
    }),
    [base, ocpn, marking, fire, labelOf, typeOf],
  );

  const displayRef = useRef(display);
  displayRef.current = display;
  const ocpnRef = useRef(ocpn);
  ocpnRef.current = ocpn;
  const markingRef = useRef(marking);
  markingRef.current = marking;
  const colorOfRef = useRef(cfg.colorOf);
  colorOfRef.current = cfg.colorOf;
  const exportSource = useMemo<VectorExportSource | null>(
    () =>
      viz
        ? {
            label: "Object-centric Petri net (current marking)",
            // The current marking is drawn as the initial one.
            toSvg: () => {
              const current = Object.fromEntries(
                Object.entries(markingRef.current)
                  .filter(([, ids]) => ids.length > 0)
                  .map(([place, ids]) => [place, ids.length]),
              );
              return ocpnElementsSvg(
                viz,
                { ...ocpnRef.current, initial_marking: current },
                displayRef.current,
                (ot) => colorOfRef.current?.("objectType", ot),
              );
            },
          }
        : null,
    [viz],
  );
  useRegisterExport(exportKey ?? "ocpn-simulator", exportSource);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 256 }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <Editor
          readOnly
          viz={viz}
          ocpn={ocpn}
          onLayoutChange={keepLayout}
          showExportControls={false}
          nodes={display.nodes}
          edges={display.edges}
          placeOverlay={placeOverlay}
          arcOverlay={arcOverlay}
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
              colorOf={(ot) => otColor(ot)}
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
