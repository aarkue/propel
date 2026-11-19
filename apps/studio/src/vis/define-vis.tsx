import type { ComponentType, ReactNode } from "react";
import { Suspense, useEffect, useRef, useState } from "react";
import type { IDockviewPanelProps } from "dockview";
import type { IconType } from "react-icons";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BackendContext,
  BindingId,
  Bindings,
  CallOptions,
  RegistryKind,
  ReturnTypeShape,
  ReturnTypeTitle,
} from "@r4pm/client";
import { BINDING_RETURN_TYPE, isCancelled } from "@r4pm/client";
import {
  EmptyState,
  ErrorState,
  JobProgressCard,
  JobProgressStrip,
  LoadingState,
  PartialResultStrip,
  ViewStateProvider,
  type ViewerProps,
} from "@r4pm/components";
import { Button, Flex, Text } from "@r4pm/components/ui";
import { PiArrowsClockwise } from "react-icons/pi";
import type { PanelCategory, PanelDefinition } from "../panels/types";
import type { ViewerDef, ViewerRenderProps } from "../viewers";
import { backend } from "../backends";
import { useDatasetSelection } from "../panels/active-datasets";
import { usePanelState } from "../panels/panel-state";
import { PanelFrame } from "../panels/panel-header";
import { JOB_UNITS } from "../shell/job-units";
import { labelForKind } from "../shell/object-colors";
import { useJobProgress } from "./components/use-job";

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
  /** Options for the long calls of a run, so the panel shows their progress and can cancel them. */
  job?: CallOptions;
  /** Show a partial result (the component's data) while the run goes on. */
  showPartial?: (data: unknown) => void;
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
  /** Hook returning what the controls still lack (e.g. a loaded model), or null. While set, the
   *  source does not run and the panel shows the message. */
  useMissing?: (controls: C) => string | null;
}

/** A panel's persisted viewer display state (what `useViewSetting` reads and writes). */
export interface PanelViewState {
  state: Record<string, unknown>;
  set: (next: Record<string, unknown>) => void;
}

type Bar<C> = (controls: C, set: (c: C) => void, datasetId: string) => ReactNode;

// Dataset kind a panel selects, e.g. "EventLog" / "OCEL".
interface BindingSource0<B extends BindingId> {
  binding: B;
  needs: RegistryKind;
  args: (ctx: VisCtx) => Bindings[B]["args"];
}
interface BindingSourceC<B extends BindingId, C> {
  binding: B;
  needs: RegistryKind;
  args: (ctx: VisCtx, controls: C) => Bindings[B]["args"];
}
interface ResolveSource0<R> {
  needs: RegistryKind;
  resolve: (ctx: VisCtx) => Promise<R>;
}
interface ResolveSourceC<R, C> {
  needs: RegistryKind;
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
  supports?: RegistryKind[];
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
  controls?: { initial: unknown; liveRefetch?: boolean; useMissing?: (controls: unknown) => string | null };
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

// Stable empty default so an unset view-state doesn't churn the provider value each render.
const EMPTY_VIEW_STATE: Record<string, unknown> = {};

function makeDataPanelComponent(
  spec: AnyVis,
  source: NonNullable<AnySource>,
): ComponentType<IDockviewPanelProps> {
  const Inner = spec.component;
  const { transform, controls, panelControlsBar, panelActions, extraProps } = spec;
  const isBinding = "binding" in source;
  return function VisPanel(props: IDockviewPanelProps) {
    const { id, selector } = useDatasetSelection(source.needs, props);
    const [c, setC] = usePanelState(props, "controls", controls?.initial);
    const [viewState, setViewState] = usePanelState(props, "viewState", EMPTY_VIEW_STATE);
    // A panel opened with `autorun` (a demo) runs right away.
    const deferred = spec.deferred && !props.params?.autorun;
    // Committed inputs that actually ran (deferred only). For non-deferred panels the live inputs
    // ARE the committed inputs, so the source runs immediately as before.
    const [ran, setRan] = useState<RunInputs | null>(null);
    const missing = controls?.useMissing?.(c) ?? null;
    const live: RunInputs | null = id && !missing ? { id, c } : null;
    const active = deferred ? ran : live;
    const stale = !!(deferred && ran && (!live || !sameInputs(ran, live)));

    const ctx: VisCtx | undefined = active ? { datasetId: active.id, backend } : undefined;
    const queryClient = useQueryClient();
    const jobs = useJobProgress();
    const [cancelled, setCancelled] = useState(false);
    const queryKey = [spec.type, active?.id, active?.c];
    const keyText = JSON.stringify(queryKey);
    // biome-ignore lint/correctness/useExhaustiveDependencies: new inputs end the cancelled state
    useEffect(() => setCancelled(false), [keyText]);
    // Our own abort instead of React Query's signal: StrictMode mounts twice in development, and a
    // consumed signal would abort the first run and start the same work again.
    const abort = useRef<AbortController | null>(null);
    const mounted = useRef(false);
    const keyRef = useRef(queryKey);
    keyRef.current = queryKey;
    // biome-ignore lint/correctness/useExhaustiveDependencies: reads the latest key through a ref
    useEffect(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
        // Closing the panel stops its work, unless a remount right after (StrictMode) or another
        // panel showing the same result still waits for it.
        setTimeout(() => {
          const waiting =
            queryClient.getQueryCache().find({ queryKey: keyRef.current })?.getObserversCount() ?? 0;
          if (!mounted.current && waiting === 0) abort.current?.abort();
        });
      };
    }, []);
    const query = useQuery({
      queryKey,
      // Not while cancelled, or a refocus would start the work again.
      enabled: !!active && !cancelled,
      // Engine errors are deterministic: a retry repeats the same work and fails the same way.
      retry: false,
      // Reopening a panel within the session shows its result again instead of recomputing.
      gcTime: 30 * 60 * 1000,
      // Keep the previous result of the same log visible (dimmed) while new settings compute, so
      // the view, and any options popover open in it, stays mounted.
      placeholderData: (prev, prevQuery) =>
        deferred || prevQuery?.queryKey[1] === active?.id ? keepPreviousData(prev) : undefined,
      queryFn: () => {
        // A run for earlier inputs is no longer shown.
        abort.current?.abort();
        abort.current = new AbortController();
        const { job, showPartial } = jobs.start(abort.current.signal);
        return isBinding
          ? (backend.callBinding as (b: string, a: unknown, o: CallOptions) => Promise<unknown>)(
              source.binding,
              source.args(ctx!, active!.c),
              job,
            )
          : source.resolve({ ...ctx!, job, showPartial }, active!.c);
      },
    });
    const cancel = backend.cancelJob
      ? () => {
          setCancelled(true);
          abort.current?.abort();
          void queryClient.cancelQueries({ queryKey });
        }
      : undefined;
    // A run another panel with the same inputs cancelled ends here too.
    const stopped = cancelled || isCancelled(query.error);
    const runAgain = () => {
      jobs.reset();
      setCancelled(false);
      if (isCancelled(query.error)) void query.refetch();
    };
    // Enrichment overlay (e.g. DFG performance). Non-blocking: the body renders once the main data
    // is ready and these props fill in when they resolve.
    const extra = useQuery({
      queryKey: [spec.type, "extra", active?.id, active?.c],
      enabled: !!active && !!extraProps,
      queryFn: () => extraProps!(ctx!, active!.c),
    });
    const running = query.isFetching;
    // While running or after a cancel, the partial result stands in for the missing one.
    const partial = (running || stopped) && jobs.partial !== undefined ? jobs.partial : undefined;
    const raw = partial ?? query.data;
    const data = raw !== undefined ? (transform ? transform(raw) : raw) : undefined;
    const bar = id ? panelControlsBar?.(c, setC, id) : undefined;
    // Data-aware actions (e.g. export PNML), in the bar (outside the export-root) so they aren't captured.
    const actions = data !== undefined && ctx ? panelActions?.(data, ctx) : undefined;
    // Dim the shown result while it is stale (awaiting a Re-run) or actively recomputing.
    const dim =
      partial === undefined &&
      ((deferred && (stale || (running && data !== undefined))) || query.isPlaceholderData);

    // Re-run control lives only after the first run; the pristine state uses the centered CTA below.
    // The button itself carries the state: amber + reload icon + dot when stale, muted otherwise.
    const runBtn =
      deferred && ran ? (
        <Flex align="center">
          <span style={{ position: "relative", display: "inline-flex" }}>
            <Button
              size="1"
              color={stale ? "amber" : "gray"}
              variant={stale ? "solid" : "soft"}
              disabled={running || !stale || !live}
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
        <EmptyState
          icon={<Icon size={40} />}
          title={`No ${labelForKind(source.needs)} loaded`}
          description="Import one or load an example to use this panel."
        />
      );
    } else if (missing && !(deferred && ran)) {
      body = <EmptyState icon={<Icon size={40} />} title={missing} />;
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
    } else if (query.error && !stopped) {
      body = <ErrorState error={query.error} onRetry={() => query.refetch()} />;
    } else if (stopped && data === undefined) {
      body = (
        <EmptyState
          icon={<Icon size={40} />}
          title="Cancelled"
          description="Nothing was computed."
          action={
            <Button size="2" onClick={runAgain}>
              Run again
            </Button>
          }
        />
      );
    } else if (data === undefined) {
      body = (
        <JobProgressCard
          progress={jobs.progress}
          onCancel={jobs.progress ? cancel : undefined}
          label="Computing..."
          units={JOB_UNITS}
        />
      );
    } else {
      const ctrl = controls ? { controls: c, onControlsChange: setC } : {};
      const strip = stopped ? (
        <PartialResultStrip onRun={runAgain} />
      ) : running ? (
        <JobProgressStrip
          progress={jobs.progress}
          onCancel={jobs.progress ? cancel : undefined}
          units={JOB_UNITS}
        />
      ) : null;
      body = (
        <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column" }}>
          {strip}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              width: "100%",
              opacity: dim ? 0.55 : 1,
              transition: "opacity 120ms ease",
            }}
          >
            <Suspense fallback={<LoadingState label="loading" />}>
              <ViewStateProvider viewState={viewState} onViewStateChange={setViewState}>
                <Inner data={data} handle={active!.id} {...ctrl} {...(extra.data ?? {})} />
              </ViewStateProvider>
            </Suspense>
          </div>
        </div>
      );
    }
    return (
      <PanelFrame
        picker={selector}
        header={
          bar || runBtn || actions ? (
            <>
              {bar}
              {runBtn}
              {actions}
            </>
          ) : undefined
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

/** What a {@link defineDatasetPanel} body gets: the picked dataset and the dockview props. */
export interface DatasetPanelProps {
  id: string;
  props: IDockviewPanelProps;
}

/**
 * Define a panel with its own UI on one dataset of `needs`: the dataset picker in the header row, the
 * empty state when none is loaded, and a fresh body (keyed by dataset) on every switch come for free.
 * Use it when a view is interactive beyond what a single `source` can express.
 */
export function defineDatasetPanel(
  spec: VisMeta & { needs: RegistryKind; component: ComponentType<DatasetPanelProps> },
): VisDefinition {
  const Body = spec.component;
  function DatasetPanel(props: IDockviewPanelProps) {
    const { id, selector } = useDatasetSelection(spec.needs, props);
    return (
      <PanelFrame
        picker={selector}
        testid={spec.type}
        body={
          id ? (
            <Suspense fallback={<LoadingState label="loading" />}>
              <Body key={id} id={id} props={props} />
            </Suspense>
          ) : (
            <EmptyState
              icon={<spec.icon size={40} />}
              title={`No ${labelForKind(spec.needs)} loaded`}
              description="Import one or load an example to use this panel."
            />
          )
        }
      />
    );
  }
  return build({ ...spec, supports: spec.supports ?? [spec.needs], component: DatasetPanel } as AnyVis);
}
