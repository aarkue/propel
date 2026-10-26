import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEdges, useNodes, useReactFlow, type Edge } from "@xyflow/react";
import { useViewerConfig, type ViewerProps } from "./viewer/viewer-config";
import { useRegisterExport, type VectorExportSource } from "./viewer/export";
import {
  Editor,
  elementsToOcpn,
  ocpnElementsSvg,
  withGeometryOf,
  type ArcContext,
  type ArcData,
  type ArcPresentation,
  type PetriElements,
  type PetriNetNode,
  type PlaceData,
} from "@r4pm/components/petri";
import { layoutOcpn, NEUTRAL, ocpnOverlays, useOtColor, type OtColor } from "./petri/ocpn-view";
import { Card, Combobox, Flex, Text, Tooltip } from "@r4pm/components/ui";
import type { Ocpn, VizTransport } from "./viz";

export type { Ocpn, OcpnArcRef, OcpnNodeRef } from "./viz";

const NO_ELEMENTS: PetriElements = { nodes: [], edges: [] };

function NumberedTokens({ count, color, isFinal }: { count: number; color: string; isFinal?: boolean }) {
  if (count <= 0) return null;
  return (
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
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          style={{
            width: isFinal ? 12 : 14,
            height: isFinal ? 12 : 14,
            borderRadius: isFinal ? "2px" : "100%",
            background: color,
            color: "#fff",
            fontSize: 9,
            fontFamily: "monospace",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            paddingBottom: "0.25px",
            opacity: isFinal ? 0.2 : 1,
          }}
        >
          {i}
        </span>
      ))}
    </div>
  );
}

/** Distinct object types, in first-seen order. */
function distinctTypes(types: (string | undefined)[]): string[] {
  return [...new Set(types.filter((t): t is string => !!t))];
}

function LegendBox({ types, otColor }: { types: string[]; otColor: OtColor }) {
  if (types.length === 0) return null;
  return (
    <Card
      size="1"
      className="bg-(--color-panel-translucent) backdrop-blur-sm"
      style={{ position: "absolute", top: "3rem", left: 8, zIndex: 5, maxHeight: "60%", overflow: "auto" }}
    >
      <Flex direction="column" gap="1">
        <Text size="1" color="gray" weight="medium">
          Object types
        </Text>
        {types.map((type) => (
          <Flex key={type} align="center" gap="2">
            <span
              style={{ width: 11, height: 11, borderRadius: 3, background: otColor(type), flexShrink: 0 }}
            />
            <Text size="1">{type}</Text>
          </Flex>
        ))}
      </Flex>
    </Card>
  );
}

/** Read-only view: places and arcs in their object type's color, the markings as numbered tokens. */
function OcpnView({
  data,
  viz,
  otColor,
  typeColor,
  exportKey,
}: {
  data: Ocpn;
  viz?: VizTransport;
  otColor: OtColor;
  typeColor: (objectType: string) => string | undefined;
  exportKey?: string;
}) {
  const [base, setBase] = useState<PetriElements>(NO_ELEMENTS);
  const [seedKey, setSeedKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    layoutOcpn(viz, data)
      .then(({ nodes, edges }) => {
        if (cancelled) return;
        setBase({ nodes, edges });
        setSeedKey((k) => k + 1);
      })
      .catch((e) => console.error("[ocpn] layout failed:", e));
    return () => {
      cancelled = true;
    };
  }, [data, viz]);

  // A drag or "Layout" the editor applied survives the next render.
  const keepLayout = useCallback(
    (nodes: PetriNetNode[], edges: Edge<ArcData>[]) => setBase((b) => withGeometryOf(b, { nodes, edges })),
    [],
  );

  const { placeOverlay, arcOverlay } = useMemo(() => {
    const typeOf = new Map(data.places.map((p) => [p.name, p.object_type]));
    const overlays = ocpnOverlays(otColor, (id) => typeOf.get(id));
    return {
      arcOverlay: overlays.arcOverlay,
      placeOverlay: (id: string, d: PlaceData): Partial<PlaceData> => {
        const style = overlays.placeOverlay(id, d);
        const color = style.tokenColor ?? NEUTRAL;
        return {
          ...style,
          renderMarking: () => (
            <>
              <NumberedTokens count={d.tokens ?? 0} color={color} />
              <NumberedTokens count={d.finalTokens ?? 0} color={color} isFinal />
            </>
          ),
        };
      },
    };
  }, [data, otColor]);

  // Reads the latest net and on-screen graph at export-click time through refs so the registered
  // source stays stable.
  const dataRef = useRef(data);
  dataRef.current = data;
  const baseRef = useRef(base);
  baseRef.current = base;
  const typeColorRef = useRef(typeColor);
  typeColorRef.current = typeColor;
  const exportSource = useMemo<VectorExportSource | null>(
    () =>
      viz
        ? {
            label: "Object-centric Petri net",
            toSvg: () => ocpnElementsSvg(viz, dataRef.current, baseRef.current, typeColorRef.current),
          }
        : null,
    [viz],
  );
  useRegisterExport(exportKey ?? "ocpn", exportSource);

  const types = useMemo(() => distinctTypes(data.places.map((p) => p.object_type)), [data]);

  // The absolute inner layer gives the Editor a definite height, so a host that
  // sizes us only via min-height doesn't collapse the height:100% chain to 0.
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 256 }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <Editor
          key={seedKey}
          readOnly
          viz={viz}
          ocpn={data}
          onLayoutChange={keepLayout}
          showExportControls={false}
          nodes={base.nodes}
          edges={base.edges}
          placeOverlay={placeOverlay}
          arcOverlay={arcOverlay}
        />
      </div>
      <LegendBox types={types} otColor={otColor} />
    </div>
  );
}

// Editable: the editor's node and edge data carries the object types and variable flags.

const placeTypes = (nodes: PetriNetNode[]): string[] =>
  distinctTypes(nodes.map((n) => (n.type === "place" ? n.data.objectType : undefined)));

/** In-place object-type picker for a place: pick an existing type or type a new name to
 *  create it. Writes directly to the place node's data (single source of truth). */
function PlaceObjectTypeSelect({
  placeId,
  value,
  objectTypes,
  colorOf,
}: {
  placeId: string;
  value: string;
  objectTypes: string[];
  colorOf: (ot: string) => string;
}) {
  const { setNodes } = useReactFlow();
  const assign = useCallback(
    (ot: string) =>
      setNodes((ns) => ns.map((n) => (n.id === placeId ? { ...n, data: { ...n.data, objectType: ot } } : n))),
    [placeId, setNodes],
  );
  return (
    <div
      className="nodrag"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        bottom: "100%",
        left: "50%",
        transform: "translateX(-50%)",
        marginBottom: 4,
        zIndex: 15,
      }}
    >
      <Combobox
        size="1"
        value={value || undefined}
        options={objectTypes}
        onValueChange={assign}
        optionColor={colorOf}
        allowCreate
        placeholder="type..."
        searchPlaceholder="Find or add type..."
        aria-label="Object type"
      />
    </div>
  );
}

/** Renders nothing; lives inside the editor's ReactFlow provider and keeps OCPN
 *  attributes well-formed as the user edits: an untyped place connected to a single
 *  object type adopts it, and every arc from a transition to places of one type shares
 *  that group's variable flag (so a freshly drawn arc joins its group automatically). */
function OcpnAutoInfer() {
  const nodes = useNodes() as PetriNetNode[];
  const edges = useEdges<Edge<ArcData>>();
  const { setNodes, setEdges } = useReactFlow();

  useEffect(() => {
    const placeIds = new Set(nodes.filter((n) => n.type === "place").map((n) => n.id));
    const typeOf = new Map<string, string>();
    for (const n of nodes) {
      if (n.type === "place" && n.data.objectType) typeOf.set(n.id, n.data.objectType);
    }

    // transition id -> arcs touching it (with the place side resolved)
    const byTransition = new Map<string, { place: string; edgeId: string; variable: boolean }[]>();
    for (const e of edges) {
      const fromPlace = placeIds.has(e.source);
      const toPlace = placeIds.has(e.target);
      if (fromPlace === toPlace) continue;
      const place = fromPlace ? e.source : e.target;
      const transition = fromPlace ? e.target : e.source;
      const arcs = byTransition.get(transition) ?? [];
      arcs.push({ place, edgeId: e.id, variable: !!e.data?.variable });
      byTransition.set(transition, arcs);
    }

    // Untyped place -> the single object type shared by its transition neighbours.
    const newType = new Map<string, string>();
    for (const n of nodes) {
      if (n.type !== "place" || n.data.objectType) continue;
      const siblingTypes = new Set<string>();
      for (const arcs of byTransition.values()) {
        if (!arcs.some((a) => a.place === n.id)) continue;
        for (const a of arcs) {
          const t = typeOf.get(a.place);
          if (t && a.place !== n.id) siblingTypes.add(t);
        }
      }
      if (siblingTypes.size === 1) newType.set(n.id, [...siblingTypes][0]);
    }
    const resolvedType = (place: string) => newType.get(place) ?? typeOf.get(place);

    // A (transition, object type) group is variable if any of its arcs is; enforce that
    // shared flag on the rest, repairing mixed groups and absorbing new arcs.
    const groupVariable = new Map<string, boolean>();
    const groupKey = (transition: string, type: string) => `${transition}\n${type}`;
    for (const [transition, arcs] of byTransition) {
      for (const a of arcs) {
        const t = resolvedType(a.place);
        if (!t) continue;
        const k = groupKey(transition, t);
        groupVariable.set(k, (groupVariable.get(k) ?? false) || a.variable);
      }
    }
    const fixVariable = new Map<string, boolean>();
    for (const [transition, arcs] of byTransition) {
      for (const a of arcs) {
        const t = resolvedType(a.place);
        if (!t) continue;
        const want = groupVariable.get(groupKey(transition, t)) ?? false;
        if (a.variable !== want) fixVariable.set(a.edgeId, want);
      }
    }

    if (newType.size > 0) {
      setNodes((ns) =>
        ns.map((n) => (newType.has(n.id) ? { ...n, data: { ...n.data, objectType: newType.get(n.id) } } : n)),
      );
    }
    if (fixVariable.size > 0) {
      setEdges((es) =>
        es.map((e) =>
          fixVariable.has(e.id) ? { ...e, data: { ...e.data, variable: fixVariable.get(e.id) } } : e,
        ),
      );
    }
  }, [nodes, edges, setNodes, setEdges]);

  return null;
}

/** Always-visible chip at an arc midpoint to toggle its variable flag. Dashed = variable.
 *  Toggling moves the whole (transition, object-type) group so the net stays well-formed:
 *  all arcs from a transition to places of one type carry the same flag. */
function ArcVariableToggle({ edgeId, variable }: { edgeId: string; variable: boolean }) {
  const { getNodes, getEdges, setEdges } = useReactFlow();
  const toggleGroup = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !variable;
    const placeType = new Map<string, string | undefined>();
    for (const n of getNodes() as PetriNetNode[]) {
      if (n.type === "place") placeType.set(n.id, n.data.objectType);
    }
    const groupOf = (x: Edge<ArcData>): { transition: string; type?: string } | null => {
      const fromPlace = placeType.has(x.source);
      const toPlace = placeType.has(x.target);
      if (fromPlace === toPlace) return null;
      const place = fromPlace ? x.source : x.target;
      return { transition: fromPlace ? x.target : x.source, type: placeType.get(place) };
    };
    const target = (getEdges() as Edge<ArcData>[]).find((x) => x.id === edgeId);
    const group = target && groupOf(target);
    setEdges((es) =>
      es.map((x) => {
        if (x.id === edgeId) return { ...x, data: { ...x.data, variable: next } };
        // Untyped place: no group, only this arc changes.
        if (!group?.type) return x;
        const g = groupOf(x);
        return g && g.transition === group.transition && g.type === group.type
          ? { ...x, data: { ...x.data, variable: next } }
          : x;
      }),
    );
  };
  return (
    <Tooltip
      content={variable ? "Variable arc - click to make normal" : "Normal arc - click to make variable"}
    >
      <button
        type="button"
        className="nodrag"
        aria-pressed={variable}
        onClick={toggleGroup}
        style={{
          pointerEvents: "all",
          cursor: "pointer",
          fontSize: 9,
          fontWeight: 700,
          lineHeight: 1,
          padding: "2px 6px",
          borderRadius: 999,
          border: variable ? "none" : "1px dashed var(--gray-8)",
          background: variable ? "var(--accent-9)" : "var(--color-panel-solid)",
          color: variable ? "var(--accent-contrast)" : "var(--gray-11)",
        }}
      >
        var
      </button>
    </Tooltip>
  );
}

/** Editable OCPN: a generic petri Editor whose live node/edge data carries the OCPN
 *  attributes, plus object-type pickers, per-arc variable toggles and a "Place" control that asks
 *  for the new place's object type. */
function OcpnEditor({
  data,
  viz,
  otColor,
  typeColor,
  onChange,
  exportKey,
}: {
  data: Ocpn;
  viz?: VizTransport;
  otColor: OtColor;
  typeColor: (objectType: string) => string | undefined;
  onChange?: (ocpn: Ocpn) => void;
  exportKey?: string;
}) {
  const [seed, setSeed] = useState<PetriElements | null>(null);
  const [objectTypes, setObjectTypes] = useState<string[]>(() =>
    distinctTypes(data.places.map((p) => p.object_type)),
  );
  const liveRef = useRef<PetriElements>(NO_ELEMENTS);

  // Lay out the seed once per incoming net; the editor owns it (uncontrolled) after.
  useEffect(() => {
    let cancelled = false;
    layoutOcpn(viz, data)
      .then(({ nodes, edges }) => {
        if (cancelled) return;
        liveRef.current = { nodes, edges };
        setSeed({ nodes, edges });
      })
      .catch((e) => console.error("[ocpn] layout failed:", e));
    return () => {
      cancelled = true;
    };
  }, [data, viz]);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const handleChange = useCallback((nodes: PetriNetNode[], edges: Edge<ArcData>[]) => {
    liveRef.current = { nodes, edges };
    setObjectTypes(placeTypes(nodes));
    onChangeRef.current?.(elementsToOcpn({ nodes, edges }));
  }, []);

  const colorOf = useCallback((t: string) => otColor(t), [otColor]);

  // An arc's place is whichever end is a place. Its object type lives on the live node data.
  const overlays = useMemo(
    () =>
      ocpnOverlays(otColor, (id) => {
        const node = liveRef.current.nodes.find((n) => n.id === id && n.type === "place");
        return (node?.data as PlaceData | undefined)?.objectType;
      }),
    [otColor],
  );

  const placeOverlay = useCallback(
    (id: string, d: PlaceData): Partial<PlaceData> => ({
      ...overlays.placeOverlay(id, d),
      renderControls: () => (
        <PlaceObjectTypeSelect
          placeId={id}
          value={d.objectType ?? ""}
          objectTypes={objectTypes}
          colorOf={colorOf}
        />
      ),
    }),
    [overlays, objectTypes, colorOf],
  );

  const arcOverlay = useCallback(
    (arc: ArcContext, d: ArcData): ArcPresentation => ({
      ...overlays.arcOverlay(arc, d),
      badge: <ArcVariableToggle edgeId={arc.id} variable={!!d.variable} />,
    }),
    [overlays],
  );

  const renderAddPlace = useCallback(
    (add: (place: PlaceData) => void) => (
      <Combobox
        size="1"
        value=""
        options={objectTypes}
        onValueChange={(objectType) => add({ objectType })}
        optionColor={colorOf}
        allowCreate
        placeholder="Place"
        searchPlaceholder="Object type of the place..."
        aria-label="Add a place of an object type"
      />
    ),
    [objectTypes, colorOf],
  );

  const typeColorRef = useRef(typeColor);
  typeColorRef.current = typeColor;
  const exportSource = useMemo<VectorExportSource | null>(
    () =>
      viz
        ? {
            label: "Object-centric Petri net",
            toSvg: () => {
              const live = liveRef.current;
              return ocpnElementsSvg(viz, elementsToOcpn(live), live, typeColorRef.current);
            },
          }
        : null,
    [viz],
  );
  useRegisterExport(exportKey ?? "ocpn", exportSource);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 256 }}>
      {seed && (
        <Editor
          editable
          viz={viz}
          ocpn
          showExportControls={false}
          initialNodes={seed.nodes}
          initialEdges={seed.edges}
          placeOverlay={placeOverlay}
          arcOverlay={arcOverlay}
          renderAddPlace={renderAddPlace}
          onChange={handleChange}
        >
          <OcpnAutoInfer />
        </Editor>
      )}
      <LegendBox types={objectTypes} otColor={otColor} />
    </div>
  );
}

/**
 * Object-centric Petri net viewer, drawn like rust4pm's `ocpn` export: places and arcs in their object
 * type's color (`ViewerConfig.colorOf`), variable arcs bold and dashed. Laid out and exported with
 * rust4pm's visualization (`ViewerConfig.viz`). The editable viewer is uncontrolled: it lays out
 * `data` on mount and reports edits via `onChange`.
 */
export interface ObjectCentricPetriNetViewerProps extends ViewerProps<Ocpn> {
  editable?: boolean;
  onChange?: (ocpn: Ocpn) => void;
  /** Export-registry key; override to avoid a collision when multiple viewers share one export frame. */
  exportKey?: string;
}

export function ObjectCentricPetriNetViewer(props: ObjectCentricPetriNetViewerProps) {
  const { data, editable, onChange, exportKey } = props;
  const { colorOf, viz } = useViewerConfig(props);
  const otColor = useOtColor(colorOf);
  const typeColor = useCallback((objectType: string) => colorOf?.("objectType", objectType), [colorOf]);

  if (editable)
    return (
      <OcpnEditor
        data={data}
        viz={viz}
        otColor={otColor}
        typeColor={typeColor}
        onChange={onChange}
        exportKey={exportKey}
      />
    );
  return <OcpnView data={data} viz={viz} otColor={otColor} typeColor={typeColor} exportKey={exportKey} />;
}
