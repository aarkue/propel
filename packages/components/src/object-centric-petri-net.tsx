import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useEdges, useNodes, useReactFlow, type Edge } from "@xyflow/react";
import { useViewerConfig, type ViewerProps } from "./viewer/viewer-config";
import { useRegisterExport, type VectorExportSource } from "./viewer/export";
import type { LegendGroup, StyledGraphRenderer } from "./graph-svg/styled-graph";
import { shadeHex } from "./dfg/util/colors";
import { PetriNetViewer, normalizePetriNet, type PetriNet, type PetriNetOverlay } from "./petri-net";
import {
  Editor,
  buildPetriNetSvg,
  nodesToPetriNet,
  petriModelToStyledGraph,
  usePetriLayout,
  type ArcContext,
  type ArcData,
  type ArcPresentation,
  type PetriNetNode,
  type PlaceData,
} from "@r4pm/components/petri";
import { Card, Combobox, Flex, Text, Tooltip } from "@r4pm/components/ui";

/**
 * Object-centric Petri net (OCPN): a plain {@link PetriNet} plus the object
 * type each place belongs to, and (optionally) which place<->transition arcs are
 * "variable" (consume/produce a variable number of tokens).
 */
export interface ObjectCentricPetriNet {
  petri_net: PetriNet;
  /** place id -> object type id. */
  place_object_type: Record<string, string>;
  /**
   * Per place id: `[incoming, outgoing]` variable-arc maps, each keyed by the
   * connected transition id. A `true` marks that arc as variable (drawn bold +
   * dashed). Optional; omit for a uniform look.
   */
  place_in_out_mult?: Record<string, [Record<string, boolean>, Record<string, boolean>]>;
}

const NEUTRAL = "#1f2937";

/** Object-type color resolver: object type -> a hex color, optionally shaded. */
type OtColor = (ot: string, mode?: "normal" | "foreground" | "light") => string;

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

/** Adapt the flat `{type,color}` legend rows into a `StyledGraph` `LegendGroup`. */
function toStyledLegend(rows: { type: string; color: string }[]): LegendGroup[] {
  if (rows.length === 0) return [];
  return [{ title: "Object types", items: rows.map((r) => ({ label: r.type, color: r.color })) }];
}

/** Distinct object types, in first-seen order, paired with their color. */
function objectTypeLegend(types: string[], otColor: OtColor): { type: string; color: string }[] {
  const seen = new Set<string>();
  const out: { type: string; color: string }[] = [];
  for (const ot of types) {
    if (!ot || seen.has(ot)) continue;
    seen.add(ot);
    out.push({ type: ot, color: otColor(ot) });
  }
  return out;
}

function LegendBox({ legend }: { legend: { type: string; color: string }[] }) {
  if (legend.length === 0) return null;
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
        {legend.map(({ type, color }) => (
          <Flex key={type} align="center" gap="2">
            <span style={{ width: 11, height: 11, borderRadius: 3, background: color, flexShrink: 0 }} />
            <Text size="1">{type}</Text>
          </Flex>
        ))}
      </Flex>
    </Card>
  );
}

// Static (read-only) overlay: colors places/arcs from the OCPN's own maps.

/** Is the place<->transition arc variable, per `place_in_out_mult`? */
function isVariableArc(ocpn: ObjectCentricPetriNet, from: string, to: string): boolean {
  const placeID = ocpn.petri_net.places.find((p) => p.id === from || p.id === to)?.id;
  if (!placeID) return false;
  const transId = to === placeID ? from : to;
  const mult = ocpn.place_in_out_mult?.[placeID];
  if (!mult) return false;
  const [incoming, outgoing] = mult;
  return from === placeID ? !!outgoing[transId] : !!incoming[transId];
}

/** Stroke styling for an arc by its variable flag: bold + dashed when variable. */
const arcVariableStyle = (variable: boolean): CSSProperties => ({
  strokeWidth: variable ? 4 : 2,
  strokeDasharray: variable ? "6 3" : undefined,
});

function buildStaticOverlay(ocpn: ObjectCentricPetriNet, otColor: OtColor): PetriNetOverlay {
  const typeOf = (id: string) => ocpn.place_object_type[id];
  const color = (id: string, mode?: "normal" | "foreground" | "light") => {
    const ot = typeOf(id);
    return ot ? otColor(ot, mode) : NEUTRAL;
  };
  return {
    place: (p) => ({
      label: typeOf(p.id),
      objectType: typeOf(p.id),
      renderMarking: () => (
        <>
          <NumberedTokens count={p.tokens} color={color(p.id, "foreground")} />
          <NumberedTokens count={p.finalTokens} color={color(p.id, "foreground")} isFinal />
        </>
      ),
      tokenColor: color(p.id, "foreground"),
      style: { borderColor: color(p.id), borderWidth: 3, background: color(p.id, "light") },
    }),
    arc: (a) => {
      const placeID = ocpn.petri_net.places.find((p) => p.id === a.from || p.id === a.to)?.id;
      if (!placeID) return undefined;
      const variable = isVariableArc(ocpn, a.from, a.to);
      return { style: { stroke: color(placeID), ...arcVariableStyle(variable) } };
    },
  };
}

// Editable: OCPN attributes live in the editor's node/edge data.

/** Lay-out-free conversion of an OCPN into editor elements, carrying `objectType`
 *  onto place data and `variable` onto arc data (the editor is the source of truth). */
function ocpnToElements(ocpn: ObjectCentricPetriNet): { nodes: PetriNetNode[]; edges: Edge<ArcData>[] } {
  const net = normalizePetriNet(ocpn.petri_net);
  const nodes: PetriNetNode[] = [
    ...net.transitions.map(
      (t): PetriNetNode => ({
        id: t.id,
        type: "transition",
        data: { label: t.label ?? undefined },
        position: { x: 0, y: 0 },
      }),
    ),
    ...net.places.map(
      (p): PetriNetNode => ({
        id: p.id,
        type: "place",
        data: {
          tokens: net.initial_marking?.[p.id],
          finalTokens: net.final_marking?.[p.id],
          objectType: ocpn.place_object_type[p.id],
        },
        position: { x: 0, y: 0 },
      }),
    ),
  ];
  const edges: Edge<ArcData>[] = net.arcs.map((a, i) => {
    const [from, to] = a.nodes;
    return {
      id: `${from} ${to}#${i}`,
      source: from,
      target: to,
      type: "custom",
      data: { weight: a.weight, variable: isVariableArc(ocpn, from, to) },
    };
  });
  return { nodes, edges };
}

/** Serialize editor elements back to an OCPN: object types from place data, variable
 *  flags from arc data (endpoint kind decides incoming vs outgoing). */
function nodesToOcpn(nodes: PetriNetNode[], edges: Edge<ArcData>[]): ObjectCentricPetriNet {
  const petri_net = nodesToPetriNet(nodes, edges);
  const placeIds = new Set(nodes.filter((n) => n.type === "place").map((n) => n.id));
  const place_object_type: Record<string, string> = {};
  for (const n of nodes) {
    if (n.type === "place" && n.data.objectType) place_object_type[n.id] = n.data.objectType;
  }
  const place_in_out_mult: Record<string, [Record<string, boolean>, Record<string, boolean>]> = {};
  for (const e of edges) {
    if (!e.data?.variable) continue;
    const fromIsPlace = placeIds.has(e.source);
    const place = fromIsPlace ? e.source : e.target;
    const trans = fromIsPlace ? e.target : e.source;
    let slot = place_in_out_mult[place];
    if (!slot) {
      slot = [{}, {}];
      place_in_out_mult[place] = slot;
    }
    slot[fromIsPlace ? 1 : 0][trans] = true;
  }
  return { petri_net, place_object_type, place_in_out_mult };
}

const placeTypes = (nodes: PetriNetNode[]): string[] =>
  Array.from(
    new Set(nodes.flatMap((n) => (n.type === "place" && n.data.objectType ? [n.data.objectType] : []))),
  );

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
 *  attributes, plus object-type pickers and per-arc variable toggles. */
function OcpnEditor({
  data,
  otColor,
  onChange,
  renderSvg,
}: {
  data: ObjectCentricPetriNet;
  otColor: OtColor;
  onChange?: (ocpn: ObjectCentricPetriNet) => void;
  renderSvg?: StyledGraphRenderer;
}) {
  const [seed, setSeed] = useState<{ nodes: PetriNetNode[]; edges: Edge<ArcData>[] } | null>(null);
  const [objectTypes, setObjectTypes] = useState<string[]>(() => placeTypes(ocpnToElements(data).nodes));
  const liveRef = useRef<{ nodes: PetriNetNode[]; edges: Edge<ArcData>[] }>({ nodes: [], edges: [] });
  const petriLayout = usePetriLayout();

  // Lay out the seed once per incoming net; the editor owns it (uncontrolled) after.
  useEffect(() => {
    let cancelled = false;
    const elements = ocpnToElements(data);
    liveRef.current = elements;
    petriLayout(elements.nodes, elements.edges).then((res) => {
      if (cancelled) return;
      liveRef.current = res;
      setSeed(res);
    });
    return () => {
      cancelled = true;
    };
  }, [data, petriLayout]);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const handleChange = useCallback((nodes: PetriNetNode[], edges: Edge<ArcData>[]) => {
    liveRef.current = { nodes, edges };
    setObjectTypes(placeTypes(nodes));
    onChangeRef.current?.(nodesToOcpn(nodes, edges));
  }, []);

  const placeOverlay = useCallback(
    (id: string, d: PlaceData): Partial<PlaceData> => {
      const ot = d.objectType;
      const color = ot ? otColor(ot) : NEUTRAL;
      return {
        label: ot,
        tokenColor: ot ? otColor(ot, "foreground") : NEUTRAL,
        style: { borderColor: color, borderWidth: 3, background: ot ? otColor(ot, "light") : undefined },
        renderControls: () => (
          <PlaceObjectTypeSelect
            placeId={id}
            value={ot ?? ""}
            objectTypes={objectTypes}
            colorOf={(t) => otColor(t)}
          />
        ),
      };
    },
    [otColor, objectTypes],
  );

  // Color an arc by its place endpoint's object type (like the read-only overlay). The place side
  // is whichever end is a place; its objectType lives on the live node data.
  const arcStroke = useCallback(
    (placeId: string | undefined): string | undefined => {
      if (!placeId) return undefined;
      const node = liveRef.current.nodes.find((n) => n.id === placeId && n.type === "place");
      const ot = (node?.data as PlaceData | undefined)?.objectType;
      return ot ? otColor(ot) : undefined;
    },
    [otColor],
  );

  const arcOverlay = useCallback(
    (arc: ArcContext, d: ArcData): ArcPresentation => {
      const variable = !!d.variable;
      const stroke = arcStroke(arc.fromType === "place" ? arc.from : arc.to);
      return {
        style: { ...arcVariableStyle(variable), ...(stroke ? { stroke } : {}) },
        badge: <ArcVariableToggle edgeId={arc.id} variable={variable} />,
      };
    },
    [arcStroke],
  );

  const legend = useMemo(() => objectTypeLegend(objectTypes, otColor), [objectTypes, otColor]);
  const styledLegend = useMemo(() => toStyledLegend(legend), [legend]);

  // Export honors styling by re-applying the place + arc overlays to the live net (the
  // overlays run at render in the DOM, so the SVG builder must re-derive them here).
  const exportSource = useMemo<VectorExportSource>(
    () => ({
      toSvg: async () => {
        const { nodes, edges } = liveRef.current;
        const placeIds = new Set(nodes.filter((n) => n.type === "place").map((n) => n.id));
        const styledNodes = nodes.map((n) =>
          n.type === "place" ? { ...n, data: { ...n.data, ...placeOverlay(n.id, n.data) } } : n,
        );
        const styledEdges = edges.map((e) => {
          const stroke = arcStroke(placeIds.has(e.source) ? e.source : e.target);
          return {
            ...e,
            style: { ...e.style, ...arcVariableStyle(!!e.data?.variable), ...(stroke ? { stroke } : {}) },
          };
        });
        if (renderSvg) {
          const graph = petriModelToStyledGraph(styledNodes, styledEdges, styledLegend);
          return graph ? renderSvg(graph) : null;
        }
        return buildPetriNetSvg(styledNodes, styledEdges);
      },
    }),
    [placeOverlay, arcStroke, renderSvg, styledLegend],
  );
  useRegisterExport("petri-net", exportSource);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 256 }}>
      {seed && (
        <Editor
          editable
          showExportControls={false}
          initialNodes={seed.nodes}
          initialEdges={seed.edges}
          placeOverlay={placeOverlay}
          arcOverlay={arcOverlay}
          onChange={handleChange}
        >
          <OcpnAutoInfer />
        </Editor>
      )}
      <LegendBox legend={legend} />
    </div>
  );
}

/**
 * Object-centric Petri net viewer. Read-only: a thin overlay over {@link PetriNetViewer}
 * coloring places/arcs by object type. Editable: a dedicated editor that keeps the OCPN
 * attributes on the editor's nodes/edges and serializes them back on every change.
 */
export interface ObjectCentricPetriNetViewerProps extends ViewerProps<ObjectCentricPetriNet> {
  editable?: boolean;
  onChange?: (ocpn: ObjectCentricPetriNet) => void;
  /** Draw the exact on-screen graph through a host-supplied renderer (typically the
   *  `export_graph_svg` Rust binding) instead of the built-in JS drawer. */
  renderSvg?: StyledGraphRenderer;
}

export function ObjectCentricPetriNetViewer(props: ObjectCentricPetriNetViewerProps) {
  const { data, editable, onChange, renderSvg } = props;
  const cfg = useViewerConfig(props);
  const otColor = useCallback<OtColor>(
    (ot, mode = "normal") => shadeHex(cfg.colorOf?.("objectType", ot) ?? "#888888", mode),
    [cfg.colorOf],
  );
  // Memoized so its stable identity doesn't retrigger the viewer's layout effect.
  const placeTypes = data.place_object_type;
  const categoryOf = useCallback((placeId: string) => placeTypes[placeId], [placeTypes]);

  if (editable) return <OcpnEditor data={data} otColor={otColor} onChange={onChange} renderSvg={renderSvg} />;

  const normNet = normalizePetriNet(data.petri_net);
  const overlay = buildStaticOverlay({ ...data, petri_net: normNet }, otColor);
  const legend = objectTypeLegend(Object.values(data.place_object_type), otColor);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 256 }}>
      <PetriNetViewer
        data={normNet}
        overlay={overlay}
        categoryOf={categoryOf}
        renderSvg={renderSvg}
        legend={toStyledLegend(legend)}
      />
      <LegendBox legend={legend} />
    </div>
  );
}
