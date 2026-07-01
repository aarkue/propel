import {
  buildPetriNetSvg,
  Editor,
  layoutPetriNet,
  nodesToPetriNet,
  type ArcData,
  type EditorEdgePatch,
  type PetriNetNode,
  type PlaceData,
  type TokenMark,
  type TransitionData,
} from "@r4pm/components/petri";
import type { Edge } from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { ViewerProps } from "./viewer/viewer-config";
import { useRegisterExport, type VectorExportSource } from "./viewer/export";

/** Petri net data shape. `label` is optional (serializes as missing/null); assignable to/from the generated `@r4pm/client` `PetriNet` type. */
export interface PetriNet {
  places: Array<{ id: string }>;
  transitions: Array<{ id: string; label?: string | null }>;
  arcs: Array<{
    nodes: [string, string];
    weight?: number;
  }>;
  initial_marking?: Record<string, number> | null;
  final_marking?: Record<string, number> | null;
}

export interface TransitionInfo {
  id: string;
  label: string | null;
}
export interface PlaceInfo {
  id: string;
  /** Token count from the net's initial marking (before any override). */
  tokens: number;
  /** Token count from the net's final marking (before any override). */
  finalTokens: number;
}
export interface ArcInfo {
  id: string;
  from: string;
  to: string;
  weight: number;
}

/** Pointer interactions an element resolver can attach. */
export interface ElementInteractions {
  onClick?: (e: MouseEvent) => void;
  onContextMenu?: (e: MouseEvent) => void;
}

/** What a transition/arc resolver returns; all fields optional. */
export interface ElementPresentation extends ElementInteractions {
  style?: CSSProperties;
  className?: string;
  label?: string;
  /** Replace the element's inner content entirely (e.g. an icon). */
  renderContent?: () => ReactNode;
}
/** What a place resolver returns; adds marking controls. */
export interface PlacePresentation extends ElementInteractions {
  style?: CSSProperties;
  className?: string;
  label?: string;
  /** Token count to draw (overrides the initial marking). */
  tokens?: number;
  /** Color of the default token dots. */
  tokenColor?: string;
  /** Explicit per-token marks (dots/squares, colored/faded); rendered in both the
   *  DOM node and the SVG export. Takes precedence over `tokens`. */
  tokenMarks?: TokenMark[];
  /** Render the marking yourself (e.g. per-object-type tokens). */
  renderMarking?: () => ReactNode;
  /** Extra editable control rendered inside the place (e.g. an object-type select). */
  renderControls?: () => ReactNode;
}

/**
 * Presentation overlay for {@link PetriNetViewer}. Each resolver is optional and
 * called once per element; return a partial presentation (or nothing) to recolor,
 * relabel, restyle, or fully re-render that element. Identity:
 *  - transitions / places by `id`
 *  - arcs by `(from, to)` (a synthetic stable `id` is also passed)
 *
 * Decide styling from your own data (closure over a map keyed by id) and/or from
 * the `raw` element passed as the second arg (if your net carries extra fields).
 *
 * @example Color places + arcs by object type (the OCPN pattern):
 * ```tsx
 * const colorOf = (placeId: string) => typeColor[objectType[placeId]];
 * const overlay: PetriNetOverlay = {
 *   place: (p) => ({ style: { borderColor: colorOf(p.id) }, tokenColor: colorOf(p.id) }),
 *   arc:   (a) => ({ style: { stroke: colorOf(a.type === "PlaceTransition" ? a.from : a.to) } }),
 * };
 * <PetriNetViewer data={net} overlay={overlay} />
 * ```
 *
 * @example Render a custom marking (any JSX), not the default token dots:
 * ```tsx
 * const overlay: PetriNetOverlay = {
 *   place: (p) => ({ renderMarking: () => <MyTokens count={p.tokens} place={p.id} /> }),
 * };
 * ```
 *
 * See `object-centric-petri-net.tsx` for a full extension built on this.
 */
export interface PetriNetOverlay {
  transition?: (
    info: TransitionInfo,
    raw: PetriNet["transitions"][number],
  ) => ElementPresentation | undefined;
  place?: (info: PlaceInfo, raw: PetriNet["places"][number]) => PlacePresentation | undefined;
  arc?: (info: ArcInfo, raw: PetriNet["arcs"][number]) => ElementPresentation | undefined;
}

/**
 * Accept a Petri net in either the component's array shape or the Rust/`@r4pm/client`
 * shape (places/transitions as id-keyed records, arcs as `{ from_to: { nodes } }`,
 * markings as `final_markings[]`) and return the canonical array shape this module
 * uses. Idempotent on already-normalized nets. Tolerates missing fields (returns
 * empty arrays) so a loading/partial net renders empty instead of throwing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizePetriNet(net: any): PetriNet {
  if (!net || typeof net !== "object") return { places: [], transitions: [], arcs: [] };
  const places = Array.isArray(net.places) ? net.places : Object.values(net.places ?? {});
  const transitions = Array.isArray(net.transitions) ? net.transitions : Object.values(net.transitions ?? {});
  const arcsIn = Array.isArray(net.arcs) ? net.arcs : [];
  const arcs = arcsIn
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((a: any) => ({ nodes: (a?.nodes ?? a?.from_to?.nodes) as [string, string], weight: a?.weight }))
    .filter((a: { nodes: unknown }) => Array.isArray(a.nodes) && a.nodes.length === 2);
  const final_marking =
    net.final_marking ?? (Array.isArray(net.final_markings) ? net.final_markings[0] : undefined) ?? null;
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    places: (places as any[]).map((p) => ({ id: p.id })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transitions: (transitions as any[]).map((t) => ({ id: t.id, label: t.label ?? null })),
    arcs,
    initial_marking: net.initial_marking ?? null,
    final_marking,
  };
}

/** Stable per-arc id from its endpoints; disambiguates rare parallel arcs. */
function arcId(from: string, to: string, seen: Set<string>): string {
  const base = `${from} ${to}`;
  let id = base;
  let i = 1;
  while (seen.has(id)) id = `${base}#${i++}`;
  seen.add(id);
  return id;
}

/** Plain, unstyled, unlaid-out editor elements for a net. Feed to `layoutPetriNet`,
 *  then re-skin per state change with {@link applyOverlay}. */
export function baseElements(rawNet: PetriNet): { nodes: PetriNetNode[]; edges: Edge<ArcData>[] } {
  const net = normalizePetriNet(rawNet);
  const nodes: PetriNetNode[] = [
    ...net.transitions.map(
      (t): PetriNetNode => ({
        id: t.id,
        type: "transition",
        data: { label: t.label ?? undefined },
        position: { x: 0, y: 0 },
      }),
    ),
    ...net.places.map((p): PetriNetNode => ({ id: p.id, type: "place", data: {}, position: { x: 0, y: 0 } })),
  ];
  const edges: Edge<ArcData>[] = net.arcs.map((a, i) => ({
    id: `${a.nodes[0]} ${a.nodes[1]}#${i}`,
    source: a.nodes[0],
    target: a.nodes[1],
    type: "custom",
    data: { weight: a.weight },
  }));
  return { nodes, edges };
}

async function layout(
  rawNet: PetriNet,
  overlay?: PetriNetOverlay,
): Promise<{ nodes: PetriNetNode[]; edges: Edge<ArcData>[] }> {
  const net = normalizePetriNet(rawNet);
  const transitionNodes: PetriNetNode[] = net.transitions.map((t) => {
    const pres = overlay?.transition?.({ id: t.id, label: t.label ?? null }, t) || undefined;
    return {
      id: t.id,
      type: "transition",
      data: {
        label: pres?.label ?? t.label ?? undefined,
        style: pres?.style,
        className: pres?.className,
        renderContent: pres?.renderContent,
        onClick: pres?.onClick,
        onContextMenu: pres?.onContextMenu,
      },
      position: { x: 0, y: 0 },
    };
  });
  const placeNodes: PetriNetNode[] = net.places.map((p) => {
    const tokens = net.initial_marking?.[p.id] ?? 0;
    const finalTokens = net.final_marking?.[p.id] ?? 0;
    const pres = overlay?.place?.({ id: p.id, tokens, finalTokens }, p) || undefined;
    return {
      id: p.id,
      type: "place",
      data: {
        tokens: pres?.tokens ?? tokens,
        finalTokens,
        tokenColor: pres?.tokenColor,
        tokenMarks: pres?.tokenMarks,
        label: pres?.label,
        style: pres?.style,
        className: pres?.className,
        renderMarking: pres?.renderMarking,
        renderControls: pres?.renderControls,
        onClick: pres?.onClick,
        onContextMenu: pres?.onContextMenu,
      },
      position: { x: 0, y: 0 },
    };
  });
  const nodes: PetriNetNode[] = [...transitionNodes, ...placeNodes];

  const seen = new Set<string>();
  const edges: Edge<ArcData>[] = net.arcs.map((arc) => {
    const [from, to] = arc.nodes;
    const id = arcId(from, to, seen);
    const pres = overlay?.arc?.({ id, from, to, weight: arc.weight ?? 1 }, arc) || undefined;
    return {
      id,
      source: from,
      target: to,
      type: "custom",
      data: {
        weight: arc.weight,
        label: pres?.label,
        className: pres?.className,
        onClick: pres?.onClick,
        onContextMenu: pres?.onContextMenu,
      },
      style: pres?.style,
    };
  });

  return layoutPetriNet(nodes, edges);
}

/** Patch overlay-derived fields (style, tokens, handlers, custom renders) onto an
 *  already-laid-out node/edge set, preserving positions and elk edge routing.
 *  Cheap and synchronous - used by simulators to re-skin on every state change
 *  without re-running layout. */
export function applyOverlay(
  base: { nodes: PetriNetNode[]; edges: Edge<ArcData>[] },
  rawNet: PetriNet,
  overlay?: PetriNetOverlay,
): { nodes: PetriNetNode[]; edges: Edge<ArcData>[] } {
  const net = normalizePetriNet(rawNet);
  const placeRaw = new Map(net.places.map((p) => [p.id, p]));
  const transRaw = new Map(net.transitions.map((t) => [t.id, t]));

  const nodes = base.nodes.map((n): PetriNetNode => {
    if (n.type === "transition") {
      const raw = transRaw.get(n.id);
      const pres =
        overlay?.transition?.({ id: n.id, label: raw?.label ?? null }, raw ?? { id: n.id }) || undefined;
      return {
        ...n,
        data: {
          ...n.data,
          label: pres?.label ?? raw?.label ?? undefined,
          style: pres?.style,
          className: pres?.className,
          renderContent: pres?.renderContent,
          onClick: pres?.onClick,
          onContextMenu: pres?.onContextMenu,
        },
      };
    }
    const raw = placeRaw.get(n.id);
    const tokens = net.initial_marking?.[n.id] ?? 0;
    const finalTokens = net.final_marking?.[n.id] ?? 0;
    const pres = overlay?.place?.({ id: n.id, tokens, finalTokens }, raw ?? { id: n.id }) || undefined;
    return {
      ...n,
      data: {
        ...n.data,
        tokens: pres?.tokens ?? tokens,
        finalTokens,
        tokenColor: pres?.tokenColor,
        tokenMarks: pres?.tokenMarks,
        label: pres?.label,
        style: pres?.style,
        className: pres?.className,
        renderMarking: pres?.renderMarking,
        renderControls: pres?.renderControls,
        onClick: pres?.onClick,
        onContextMenu: pres?.onContextMenu,
      },
    };
  });

  const edges = base.edges.map((e): Edge<ArcData> => {
    const pres =
      overlay?.arc?.(
        { id: e.id, from: e.source, to: e.target, weight: e.data?.weight ?? 1 },
        { nodes: [e.source, e.target], weight: e.data?.weight },
      ) || undefined;
    return {
      ...e,
      style: pres?.style ?? e.style,
      data: {
        ...e.data,
        label: pres?.label,
        className: pres?.className,
        onClick: pres?.onClick,
        onContextMenu: pres?.onContextMenu,
      },
    };
  });

  return { nodes, edges };
}

/** Props of {@link PetriNetViewer}: the standard viewer props plus an optional
 *  presentation overlay used by alignment-style views. Backward compatible: the
 *  overlay defaults to undefined. */
export interface PetriNetViewerProps extends ViewerProps<PetriNet> {
  overlay?: PetriNetOverlay;
  /** Allow structural + marking editing. The editable viewer is uncontrolled:
   *  it lays out `data` on mount and reports edits via `onChange`; do not feed
   *  `onChange` output straight back as `data` (use a `key` to force a reset). */
  editable?: boolean;
  /** Called with the serialized net after each edit. */
  onChange?: (net: PetriNet) => void;
}

export function PetriNetViewer({ data, overlay, editable, onChange }: PetriNetViewerProps) {
  const [base, setBase] = useState<{ nodes: PetriNetNode[]; edges: Edge<ArcData>[] }>({
    nodes: [],
    edges: [],
  });
  const [seedKey, setSeedKey] = useState(0);

  // Accept either the array shape or the client/record shape (and tolerate
  // loading/partial data) so studio bindings and stories both work.
  const net = useMemo(() => normalizePetriNet(data), [data]);

  // Layout depends only on topology, not the overlay, so recolor/marking/selection
  // changes never relayout or remount the editor (which would discard live edits).
  useEffect(() => {
    let cancelled = false;
    layout(net).then((res) => {
      if (cancelled) return;
      setBase(res);
      setSeedKey((k) => k + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [net]);

  const display = useMemo(() => applyOverlay(base, net, overlay), [base, net, overlay]);

  // Advertise a vector export (honors overlay styling). Reads the latest display at
  // export time through a ref so the registered source stays stable.
  const displayRef = useRef(display);
  displayRef.current = display;
  const exportSource = useMemo<VectorExportSource>(
    () => ({ toSvg: () => buildPetriNetSvg(displayRef.current.nodes, displayRef.current.edges) }),
    [],
  );
  useRegisterExport("petri-net", exportSource);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const handleEditorChange = useCallback(
    (ns: PetriNetNode[], es: Edge<ArcData>[]) => onChangeRef.current?.(nodesToPetriNet(ns, es)),
    [],
  );

  // Editable mode: the editor owns structure; only cosmetics are patched back in by
  // id (tokens/finalTokens excluded, the stepper owns those).
  const nodePatches = useMemo(() => {
    const m = new Map<string, Partial<TransitionData & PlaceData>>();
    for (const n of display.nodes) {
      if (n.type === "transition") {
        const d = n.data;
        m.set(n.id, {
          style: d.style,
          className: d.className,
          label: d.label,
          renderContent: d.renderContent,
          onClick: d.onClick,
          onContextMenu: d.onContextMenu,
        });
      } else {
        const d = n.data;
        m.set(n.id, {
          style: d.style,
          className: d.className,
          label: d.label,
          tokenColor: d.tokenColor,
          renderMarking: d.renderMarking,
          renderControls: d.renderControls,
          onClick: d.onClick,
          onContextMenu: d.onContextMenu,
        });
      }
    }
    return m;
  }, [display]);
  const edgePatches = useMemo<EditorEdgePatch[]>(
    () =>
      display.edges.map((e) => ({
        from: e.source,
        to: e.target,
        style: e.style as CSSProperties | undefined,
        className: e.data?.className,
        label: e.data?.label,
        onClick: e.data?.onClick,
        onContextMenu: e.data?.onContextMenu,
      })),
    [display],
  );

  // The absolute inner layer gives the Editor a definite height, so a host that
  // sizes us only via min-height doesn't collapse the height:100% chain to 0.
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 256 }}>
      <div style={{ position: "absolute", inset: 0 }}>
        {editable ? (
          <Editor
            key={seedKey}
            editable
            onChange={handleEditorChange}
            showExportControls={false}
            initialNodes={display.nodes}
            initialEdges={display.edges}
            overlayNodeData={nodePatches}
            overlayEdgeData={edgePatches}
          />
        ) : (
          <Editor
            key={seedKey}
            readOnly
            showExportControls={false}
            nodes={display.nodes}
            edges={display.edges}
          />
        )}
      </div>
    </div>
  );
}
