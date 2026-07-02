import type { ComponentType, ReactNode } from "react";
import { Suspense, useState } from "react";
import type { IDockviewPanelProps } from "dockview";
import type { IconType } from "react-icons";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { BackendContext, BindingId, Bindings, ReturnTypeShape, ReturnTypeTitle } from "@r4pm/client";
import { BINDING_RETURN_TYPE } from "@r4pm/client";
import { EmptyState, ErrorState, LoadingState, type ViewerProps } from "@r4pm/components";
import { Button, Flex, Text } from "@r4pm/components/ui";
import { PiArrowsClockwise } from "react-icons/pi";
import type { PanelCategory, PanelDefinition } from "../panels/types";
import type { ViewerDef, ViewerRenderProps } from "../viewers";
import { backend } from "../backends";
import { useDatasetSelection } from "../panels/active-datasets";

/**
 * Single source of truth for a visualization. ONE `defineVis(...)` emits both a dockview
 * `PanelDefinition` (live: selects a dataset, runs the source, fetches) and a `ViewerDef` (dumb:
 * renders a precomputed result, used by the pipeline + standalone). Both reuse the same pure
 * `@r4pm/components` component, so a viz is defined once and exposed everywhere with no hand-written
 * `defineViewer` and no `backend/` wrapper.
 *
 * Type-safety chains off the binding id `B`: `source.args` is pinned to `Bindings[B]["args"]`, any
 * `transform` input to `Bindings[B]["ret"]`, and (no transform) the `component` data prop to
 * `Bindings[B]["ret"]` - a mismatch is a compile error, not a runtime miss. The viewer `accepts` is
 * derived from `BINDING_RETURN_TYPE[B]`.
 *
 * `defineResolvedVis` has no binding to chain off, so its viewer is registered only via a `viewer`
 * map: title -> adapter from that title's raw payload (`ReturnTypeShape[title]`) to the component
 * data type. Claiming a title whose payload the component can't render is a compile error.
 */

export interface VisCtx {
  datasetId: string;
  backend: BackendContext;
}

/**
 * A control-bearing component also gets the current `controls` and an OPTIONAL `onControlsChange`:
 * present in the panel (drives a refetch), and in the viewer only when controls are client-side
 * (`liveRefetch: false`). When absent the component hides its editors and renders read-only -
 * exactly how a pipeline viewer with no backend should behave.
 */
interface Ctrl<C> {
  controls: C;
  onControlsChange?: (next: C) => void;
}

interface ControlsSpec<C> {
  initial: C;
  /** Default true: a control change re-runs the source (panel refetches; viewer goes read-only).
   *  Set false for purely client-side controls that stay editable in the viewer. */
  liveRefetch?: boolean;
}

type Bar<C> = (controls: C, set: (c: C) => void, datasetId: string) => ReactNode;

// Dataset kind a panel selects, e.g. "EventLog" / "OCEL".
interface BindingSource0<B extends BindingId> {
  binding: B;
  needs: string;
  args: (ctx: VisCtx) => Bindings[B]["args"];
}
interface BindingSourceC<B extends BindingId, C> {
  binding: B;
  needs: string;
  args: (ctx: VisCtx, controls: C) => Bindings[B]["args"];
}
interface ResolveSource0<R> {
  needs: string;
  resolve: (ctx: VisCtx) => Promise<R>;
}
interface ResolveSourceC<R, C> {
  needs: string;
  resolve: (ctx: VisCtx, controls: C) => Promise<R>;
}

/** Viewer adapters: accepted return-type title -> function from that title's raw payload to the
 *  component's data prop `P`. The keys drive `accepts`. */
export type ViewerSources<P> = {
  [RT in ReturnTypeTitle]?: (data: ReturnTypeShape[RT]) => P;
};

interface VisMeta {
  type: string;
  name: string;
  description: string;
  category: PanelCategory;
  icon: IconType;
  order?: number;
  tags?: PanelCategory[];
  supports?: string[];
  keywords?: string[];
  genericExport?: boolean;
  hidden?: boolean;
  /** Gate computation behind an explicit Run button. The panel opens showing its selectors but no
   *  result; the source runs only on Run. Changing an input after a run marks the result stale and
   *  requires a Re-run. Use for expensive sources (alignment, oc-declare). Default false = auto-run. */
  deferred?: boolean;
  /** Register the dockview panel. Default true. */
  panel?: boolean;
}

export interface VisDefinition {
  panel?: PanelDefinition;
  viewer?: ViewerDef;
}

type AnySource = BindingSourceC<BindingId, unknown> | ResolveSourceC<unknown, unknown> | undefined;
interface AnyVis extends VisMeta {
  source?: AnySource;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  viewer?: boolean | Record<string, (data: any) => unknown>;
  transform?: (data: unknown) => unknown;
  controls?: { initial: unknown; liveRefetch?: boolean };
  panelControlsBar?: (controls: unknown, set: (c: unknown) => void, datasetId: string) => ReactNode;
  panelActions?: (data: unknown, ctx: VisCtx) => ReactNode;
  extraProps?: (ctx: VisCtx, controls: unknown) => Promise<Record<string, unknown>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
}

/** Optional second fetch whose result is spread onto the component as extra props - PANEL ONLY (the
 *  viewer has no backend). Use for an overlay the pipeline can't supply, e.g. a DFG performance map.
 *  Loosely typed: the keys must match the component's extra props (verified by reading the call). */
type ExtraProps = (ctx: VisCtx) => Promise<Record<string, unknown>>;

const frameStyle = { height: "100%", width: "100%", display: "flex", flexDirection: "column" } as const;

function Frame({ bars, body, testid }: { bars: ReactNode; body: ReactNode; testid?: string }) {
  return (
    <div data-testid={testid} style={frameStyle}>
      {bars}
      <div data-export-root style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {body}
      </div>
    </div>
  );
}

function returnTypeOf(source: AnySource): ReturnTypeTitle | null {
  if (!source) return null;
  return "binding" in source ? BINDING_RETURN_TYPE[source.binding] : null;
}

function makeViewerComponent(
  spec: AnyVis,
  sources: Record<string, (data: unknown) => unknown> | null,
): ViewerDef["component"] {
  const Inner = spec.component;
  const { transform, controls } = spec;
  const editable = controls ? controls.liveRefetch === false : false;
  return function VisViewer({ returnType, ...props }: ViewerProps<unknown> & ViewerRenderProps) {
    const [c, setC] = useState(controls?.initial);
    // A single-entry map needs no title to disambiguate (hosts may not pass one).
    const entries = sources ? Object.values(sources) : null;
    const adapt = sources
      ? returnType
        ? sources[returnType]
        : entries?.length === 1
          ? entries[0]
          : undefined
      : transform;
    // Controls that drive a refetch can't recompute in the viewer (no backend) -> render read-only.
    const ctrl = controls ? { controls: c, onControlsChange: editable ? setC : undefined } : {};
    if (sources && !adapt) {
      return (
        <ErrorState
          error={new Error(`${spec.type}: no adapter for return type "${returnType ?? "unknown"}"`)}
        />
      );
    }
    const data = adapt ? adapt(props.data) : props.data;
    return (
      <Suspense fallback={<LoadingState label="loading" />}>
        <Inner {...props} data={data} {...ctrl} />
      </Suspense>
    );
  };
}

type RunInputs = { id: string; c: unknown };

function sameInputs(a: RunInputs | null, b: RunInputs | null): boolean {
  return a?.id === b?.id && JSON.stringify(a?.c) === JSON.stringify(b?.c);
}

const barsRowStyle = { display: "flex", flexWrap: "wrap", alignItems: "stretch" } as const;

function makeDataPanelComponent(
  spec: AnyVis,
  source: NonNullable<AnySource>,
): ComponentType<IDockviewPanelProps> {
  const Inner = spec.component;
  const { transform, controls, panelControlsBar, panelActions, extraProps, deferred } = spec;
  const isBinding = "binding" in source;
  return function VisPanel(_props: IDockviewPanelProps) {
    const { id, selector } = useDatasetSelection(source.needs);
    const [c, setC] = useState(controls?.initial);
    // Committed inputs that actually ran (deferred only). For non-deferred panels the live inputs
    // ARE the committed inputs, so the source runs immediately as before.
    const [ran, setRan] = useState<RunInputs | null>(null);
    const live: RunInputs | null = id ? { id, c } : null;
    const active = deferred ? ran : live;
    const stale = !!(deferred && ran && (!live || !sameInputs(ran, live)));

    const ctx: VisCtx | undefined = active ? { datasetId: active.id, backend } : undefined;
    const query = useQuery({
      queryKey: [spec.type, active?.id, active?.c],
      enabled: !!active,
      // Keep the previous result visible (dimmed) while a Re-run recomputes.
      placeholderData: deferred ? keepPreviousData : undefined,
      queryFn: () =>
        isBinding
          ? (backend.callBinding as (b: string, a: unknown) => Promise<unknown>)(
              source.binding,
              source.args(ctx!, active!.c),
            )
          : source.resolve(ctx!, active!.c),
    });
    // Enrichment overlay (e.g. DFG performance). Non-blocking: the body renders once the main data
    // is ready and these props fill in when they resolve.
    const extra = useQuery({
      queryKey: [spec.type, "extra", active?.id, active?.c],
      enabled: !!active && !!extraProps,
      queryFn: () => extraProps!(ctx!, active!.c),
    });
    const data = query.data !== undefined ? (transform ? transform(query.data) : query.data) : undefined;
    const bar = id ? panelControlsBar?.(c, setC, id) : undefined;
    // Data-aware actions (e.g. export PNML), in the bar (outside the export-root) so they aren't captured.
    const actions = data !== undefined && ctx ? panelActions?.(data, ctx) : undefined;
    const running = query.isFetching;
    // Dim the shown result while it is stale (awaiting a Re-run) or actively recomputing.
    const dim = deferred && (stale || (running && data !== undefined));

    // Re-run control lives only after the first run; the pristine state uses the centered CTA below.
    // The button itself carries the state: amber + reload icon + dot when stale, muted otherwise.
    const runBtn =
      deferred && ran ? (
        <Flex align="center" px="2" py="1" style={{ borderBottom: "1px solid var(--gray-5)" }}>
          <span style={{ position: "relative", display: "inline-flex" }}>
            <Button
              size="1"
              color={stale ? "amber" : "gray"}
              variant={stale ? "solid" : "soft"}
              disabled={running || !stale}
              onClick={() => setRan(live)}
            >
              {running ? (
                "Running..."
              ) : stale ? (
                <>
                  <PiArrowsClockwise style={{ marginInlineEnd: 4 }} /> Re-run
                </>
              ) : (
                "Up to date"
              )}
            </Button>
            {stale && !running ? (
              <span
                style={{
                  position: "absolute",
                  top: -3,
                  right: -3,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--amber-9)",
                  boxShadow: "0 0 0 2px var(--color-panel-solid)",
                }}
              />
            ) : null}
          </span>
        </Flex>
      ) : null;

    const Icon = spec.icon;
    let body: ReactNode;
    if (!id) {
      body = (
        <EmptyState title={`No ${source.needs} dataset loaded`} description="Load one to view this panel." />
      );
    } else if (deferred && !ran) {
      body = (
        <Flex
          direction="column"
          align="center"
          justify="center"
          gap="3"
          style={{ height: "100%", padding: 24, textAlign: "center" }}
        >
          <Icon size={40} style={{ color: "var(--gray-8)" }} />
          <Text size="3" weight="medium">
            {spec.name} not computed yet
          </Text>
          <Text size="2" color="gray" style={{ maxWidth: 320 }}>
            This analysis is expensive, so it runs on demand. Configure inputs above, then run.
          </Text>
          <Button size="2" disabled={!live || running} onClick={() => setRan(live)}>
            {running ? "Running..." : "Execute"}
          </Button>
        </Flex>
      );
    } else if (query.error) {
      body = <ErrorState error={query.error} onRetry={() => query.refetch()} />;
    } else if (query.isPending) {
      body = <LoadingState label="computing..." slowAfterMs={8000} />;
    } else {
      const ctrl = controls ? { controls: c, onControlsChange: setC } : {};
      body = (
        <div
          style={{
            height: "100%",
            width: "100%",
            opacity: dim ? 0.55 : 1,
            transition: "opacity 120ms ease",
          }}
        >
          <Suspense fallback={<LoadingState label="loading" />}>
            <Inner data={data} handle={active!.id} {...ctrl} {...(extra.data ?? {})} />
          </Suspense>
        </div>
      );
    }
    return (
      <Frame
        bars={
          <div style={barsRowStyle}>
            {selector}
            {bar}
            {runBtn}
            {actions}
          </div>
        }
        body={body}
        testid={spec.type}
      />
    );
  };
}

function makePlainPanelComponent(spec: AnyVis): ComponentType<IDockviewPanelProps> {
  const Inner = spec.component;
  // Pass the dockview props through so a panel can read its `params` (e.g. the output viewer).
  return function VisPlainPanel(props: IDockviewPanelProps) {
    return (
      <Suspense fallback={<LoadingState label="loading" />}>
        <Inner {...props} />
      </Suspense>
    );
  };
}

function build(spec: AnyVis): VisDefinition {
  const source = spec.source;
  const out: VisDefinition = {};

  if (spec.viewer !== false && source) {
    const sources = typeof spec.viewer === "object" ? spec.viewer : null;
    const rt = returnTypeOf(source);
    if (sources) {
      out.viewer = {
        id: spec.type,
        title: spec.name,
        accepts: (m) => m.returnType in sources,
        component: makeViewerComponent(spec, sources),
      };
    } else if (rt) {
      out.viewer = {
        id: spec.type,
        title: spec.name,
        accepts: (m) => m.returnType === rt,
        component: makeViewerComponent(spec, null),
      };
    } else if (spec.viewer === true) {
      console.warn(`defineVis("${spec.type}"): viewer requested but no return-type title; skipped.`);
    }
  }

  if (spec.panel !== false) {
    out.panel = {
      type: spec.type,
      name: spec.name,
      description: spec.description,
      order: spec.order,
      category: spec.category,
      tags: spec.tags,
      icon: spec.icon,
      supports: spec.supports,
      keywords: spec.keywords,
      hidden: spec.hidden,
      genericExport: spec.genericExport,
      component: source ? makeDataPanelComponent(spec, source) : makePlainPanelComponent(spec),
    };
  }

  return out;
}

/**
 * Define a visualization backed by a SINGLE binding. One call emits both the dockview panel and the
 * viewer. The no-transform overloads pin the component's `data` prop to `Bindings[B]["ret"]` and the
 * args to `Bindings[B]["args"]`, so a wrong type/key is a compile error. `controls` is required in
 * the interactive overloads so C is inferred from `controls.initial`.
 */
// binding + controls + transform
export function defineVis<B extends BindingId, C, P>(
  spec: VisMeta & {
    source: BindingSourceC<B, C>;
    controls: ControlsSpec<C>;
    transform: (data: Bindings[B]["ret"]) => P;
    viewer?: boolean;
    panelControlsBar?: Bar<C>;
    component: ComponentType<ViewerProps<P> & Ctrl<C>>;
  },
): VisDefinition;
// binding + controls
export function defineVis<B extends BindingId, C>(
  spec: VisMeta & {
    source: BindingSourceC<B, C>;
    controls: ControlsSpec<C>;
    transform?: undefined;
    viewer?: boolean;
    panelControlsBar?: Bar<C>;
    component: ComponentType<ViewerProps<Bindings[B]["ret"]> & Ctrl<C>>;
  },
): VisDefinition;
// binding + transform
export function defineVis<B extends BindingId, P>(
  spec: VisMeta & {
    source: BindingSource0<B>;
    transform: (data: Bindings[B]["ret"]) => P;
    viewer?: boolean;
    extraProps?: ExtraProps;
    component: ComponentType<ViewerProps<P>>;
  },
): VisDefinition;
// binding only (optionally with a panel-side enrichment overlay via `extraProps` and/or data-aware
// `panelActions` like an export button)
export function defineVis<B extends BindingId>(
  spec: VisMeta & {
    source: BindingSource0<B>;
    transform?: undefined;
    viewer?: boolean;
    extraProps?: ExtraProps;
    panelActions?: (data: Bindings[B]["ret"], ctx: VisCtx) => ReactNode;
    component: ComponentType<ViewerProps<Bindings[B]["ret"]>>;
  },
): VisDefinition;
export function defineVis(spec: AnyVis): VisDefinition {
  return build(spec);
}

/**
 * Define a visualization whose data comes from a custom async `resolve` (e.g. several chained
 * bindings, like alignment = discover + align). The panel calls `resolve` for its data `R`. The
 * viewer (pipeline + standalone) gets raw binding payloads instead, so it is registered only via
 * the `viewer` map: one adapter per accepted return-type title (omit or `false` for panel-only).
 */
// resolve + controls
export function defineResolvedVis<R, C>(
  spec: VisMeta & {
    source: ResolveSourceC<R, C>;
    controls: ControlsSpec<C>;
    viewer?: false | ViewerSources<R>;
    panelControlsBar?: Bar<C>;
    component: ComponentType<ViewerProps<R> & Ctrl<C>>;
  },
): VisDefinition;
// resolve only
export function defineResolvedVis<R>(
  spec: VisMeta & {
    source: ResolveSource0<R>;
    viewer?: false | ViewerSources<R>;
    component: ComponentType<ViewerProps<R>>;
  },
): VisDefinition;
export function defineResolvedVis(spec: AnyVis): VisDefinition {
  return build(spec);
}

/**
 * Define a plain panel with no data source (e.g. about, pipeline editor, the output viewer). Panel
 * only, no viewer. The component receives the raw dockview props, so it can read `params` and manage
 * its own dataset selection / layout.
 */
export function definePanel(
  spec: VisMeta & { component: ComponentType<IDockviewPanelProps> },
): VisDefinition {
  return build(spec as AnyVis);
}
