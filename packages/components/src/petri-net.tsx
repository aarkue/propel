import {
  Editor,
  layoutPetriElements,
  noopPetriLayout,
  nodesToPetriNet,
  petriElementsSvg,
  withGeometryOf,
  type ArcData,
  type EditorEdgePatch,
  type PetriElements,
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
import { useViewerConfig, type ViewerProps } from "./viewer/viewer-config";
import { useRegisterExport, type VectorExportSource } from "./viewer/export";
import { normalizePetriNet } from "./petri/net-json";
import type { ElementStyle } from "./viz";

export {
  normalizePetriNet,
  placeNodeId,
  type RustPetriNet,
  toRustPetriNet,
  transitionNodeId,
} from "./petri/net-json";

/** Petri net data shape. `label` is optional (serializes as missing/null); assignable to/from the generated `@r4pm/client` `PetriNet` type. */
export interface PetriNet {
  /** `name` is the external id (e.g., from PNML), kept so a round trip through rust4pm keeps it. */
  places: Array<{ id: string; name?: string | null }>;
  transitions: Array<{ id: string; label?: string | null; name?: string | null }>;
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
  /** Highlight, dim or annotate the element, on screen and in the exported image (rust4pm's
   *  `ElementStyle`, e.g., a heatmap fill or an `extra_label` line under the label). */
  elementStyle?: ElementStyle;
  /** On-screen CSS only. */
  style?: CSSProperties;
  className?: string;
  label?: string;
  /** Replace the element's inner content entirely (e.g. an icon). */
  renderContent?: () => ReactNode;
}
/** What a place resolver returns; adds marking controls. */
export interface PlacePresentation extends ElementInteractions {
  /** Highlight, dim or annotate the place, on screen and in the exported image. */
  elementStyle?: ElementStyle;
  /** On-screen CSS only. */
  style?: CSSProperties;
  className?: string;
  label?: string;
  /** Token count to draw (overrides the initial marking). */
  tokens?: number;
  /** Color of the default token dots. */
  tokenColor?: string;
  /** Explicit per-token marks (dots/squares, colored/faded), on screen. Takes precedence over
   *  `tokens`. */
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
 * @example Color places + arcs by object type:
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
 */
export interface PetriNetOverlay {
  transition?: (
    info: TransitionInfo,
    raw: PetriNet["transitions"][number],
  ) => ElementPresentation | undefined;
  place?: (info: PlaceInfo, raw: PetriNet["places"][number]) => PlacePresentation | undefined;
  arc?: (info: ArcInfo, raw: PetriNet["arcs"][number]) => ElementPresentation | undefined;
}

/** Plain, unstyled, unlaid-out editor elements for a net. Feed to `layoutPetriElements`,
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

/** Patch overlay-derived fields (style, tokens, handlers, custom renders) onto an
 *  already-laid-out node/edge set, preserving positions and edge routing.
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
          elementStyle: pres?.elementStyle,
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
        elementStyle: pres?.elementStyle,
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
        elementStyle: pres?.elementStyle,
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
  /** Export-registry key; override to avoid a collision when multiple viewers share one export frame. */
  exportKey?: string;
}

const NO_ELEMENTS: PetriElements = { nodes: [], edges: [] };

/** A Petri net laid out and exported with rust4pm's visualization (`ViewerConfig.viz`). */
export function PetriNetViewer(props: PetriNetViewerProps) {
  const { data, overlay, editable, onChange, exportKey } = props;
  const { viz } = useViewerConfig(props);
  const [base, setBase] = useState<PetriElements>(NO_ELEMENTS);
  const [seedKey, setSeedKey] = useState(0);
  // The live editor graph in editable mode, which the export draws.
  const editedRef = useRef<PetriElements | null>(null);

  // Accept either the array shape or the client/record shape (and tolerate
  // loading/partial data) so studio bindings and stories both work.
  const net = useMemo(() => normalizePetriNet(data), [data]);

  // Layout depends only on topology, not the overlay, so recolor/marking/selection
  // changes never relayout or remount the editor (which would discard live edits).
  useEffect(() => {
    let cancelled = false;
    const elements = baseElements(net);
    (viz ? layoutPetriElements(viz, net, elements) : noopPetriLayout(elements.nodes, elements.edges))
      .then(({ nodes, edges }) => {
        if (cancelled) return;
        editedRef.current = null;
        setBase({ nodes, edges });
        setSeedKey((k) => k + 1);
      })
      .catch((e) => console.error("[petri] layout failed:", e));
    return () => {
      cancelled = true;
    };
  }, [net, viz]);

  const display = useMemo(() => applyOverlay(base, net, overlay), [base, net, overlay]);

  // A drag the editor re-routed survives the next overlay change.
  const keepLayout = useCallback(
    (nodes: PetriNetNode[], edges: Edge<ArcData>[]) => setBase((b) => withGeometryOf(b, { nodes, edges })),
    [],
  );

  // Reads the latest net and on-screen graph at export-click time through refs so the registered
  // source stays stable.
  const netRef = useRef(net);
  netRef.current = net;
  const displayRef = useRef(display);
  displayRef.current = display;
  const exportSource = useMemo<VectorExportSource | null>(
    () =>
      viz
        ? {
            label: "Petri net",
            toSvg: () => {
              const edited = editedRef.current;
              return edited
                ? petriElementsSvg(viz, nodesToPetriNet(edited.nodes, edited.edges), edited)
                : petriElementsSvg(viz, netRef.current, displayRef.current);
            },
          }
        : null,
    [viz],
  );
  useRegisterExport(exportKey ?? "petri-net", exportSource);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const handleEditorChange = useCallback((ns: PetriNetNode[], es: Edge<ArcData>[]) => {
    editedRef.current = { nodes: ns, edges: es };
    onChangeRef.current?.(nodesToPetriNet(ns, es));
  }, []);

  // Editable mode: the editor owns structure; only cosmetics are patched back in by
  // id (tokens/finalTokens excluded, the stepper owns those).
  const nodePatches = useMemo(() => {
    const m = new Map<string, Partial<TransitionData & PlaceData>>();
    for (const n of display.nodes) {
      if (n.type === "transition") {
        const d = n.data;
        m.set(n.id, {
          style: d.style,
          elementStyle: d.elementStyle,
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
          elementStyle: d.elementStyle,
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
        elementStyle: e.data?.elementStyle,
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
            viz={viz}
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
            viz={viz}
            net={net}
            onLayoutChange={keepLayout}
            showExportControls={false}
            nodes={display.nodes}
            edges={display.edges}
          />
        )}
      </div>
    </div>
  );
}
