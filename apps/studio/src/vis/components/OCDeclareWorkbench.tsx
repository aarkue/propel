import type { OCDeclareArc as ClientArc, SlimLinkedOCELHandle } from "@r4pm/client";
import {
  arcsToModel,
  type DeclareFlowModel,
  focusHidden,
  fromModelFile,
  isProjected,
  mergeArcs,
  OC_DECLARE_HIDDEN_ACTIVITIES_KEY,
  type OCDeclareArc,
  OCDeclareViz,
  projectionTargets,
  toArcs,
  useViewerConfig,
} from "@r4pm/components";
import { Button, Flex, IconButton, SegmentedControl, Text, Tooltip } from "@r4pm/components/ui";
import { useQuery } from "@tanstack/react-query";
import type { IDockviewPanelProps } from "dockview";
import { useCallback, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { PiArrowsClockwise, PiLightning, PiListBullets, PiX } from "react-icons/pi";
import { backend } from "../../backends";
import { useDatasetSelection } from "../../panels/active-datasets";
import { usePanelDraft, usePanelState } from "../../panels/panel-state";
import {
  hiddenActivitiesOf,
  OC_DECLARE_DEFAULTS,
  OC_DECLARE_DISCOVER,
  OC_DECLARE_PROJECT,
  ocDeclareDiscovery,
  ocDeclarePanelExtras,
  violationFractions,
} from "../_oc-declare-discovery";
import {
  arcKey,
  asksBeforeReplace,
  contentKey,
  type DiscoveryRun,
  discoverButton,
  type Evaluation,
  initialOrigin,
  type ModelOrigin,
  newArcs,
  originAfterChange,
  type PanelMode,
  viewSettings,
  viewStateForEdit,
  withEvaluation,
} from "../_oc-declare-workbench";
import type { PanelViewState } from "../define-vis";
import { OCDeclareBar } from "./OCDeclareBar";
import { OCDeclareModelActions } from "./OCDeclareModelActions";
import { ReplaceModelDialog } from "./ReplaceModelDialog";

const EMPTY_MODEL: DeclareFlowModel = { nodes: [], edges: [] };
const EMPTY_VIEW_STATE: Record<string, unknown> = {};
const barCell = { borderBottom: "1px solid var(--gray-5)" } as const;

/** Evaluation marks live in the panel, not in the model, so a saved model never carries them. */
const withoutMarks = (m: DeclareFlowModel): DeclareFlowModel => ({
  ...m,
  edges: m.edges.map(({ violation: _v, ...e }) => e),
});

const withoutLayout = (m: DeclareFlowModel): DeclareFlowModel => ({
  nodes: m.nodes.map(({ position: _p, ...n }) => n),
  edges: m.edges.map(({ route: _r, ...e }) => e),
});

function seedModel(doc: unknown): DeclareFlowModel {
  if (doc === undefined) return EMPTY_MODEL;
  try {
    return fromModelFile(doc);
  } catch {
    return EMPTY_MODEL;
  }
}

/** The OC-DECLARE panel: discover from a log, project, edit and evaluate one model, and open,
 *  save and export it. A saved model opens here with its file as the `doc` param. */
export function OCDeclareWorkbench(props: IDockviewPanelProps) {
  const { id: ocel, selector } = useDatasetSelection("SlimLinkedOCEL", props);
  const params = (props.params ?? {}) as { origin?: unknown; model?: unknown; doc?: unknown };
  const [rawControls, setControls] = usePanelState<unknown>(props, "controls", OC_DECLARE_DEFAULTS);
  const controls = useMemo(() => ocDeclareDiscovery(rawControls), [rawControls]);
  const [viewState, setViewState] = usePanelState<Record<string, unknown>>(
    props,
    "viewState",
    EMPTY_VIEW_STATE,
  );
  const view: PanelViewState = { state: viewState, set: setViewState };
  const seed = useMemo(() => seedModel(params.doc), [params.doc]);
  const [model, setModel] = usePanelDraft<DeclareFlowModel>(props, "model", seed);
  const [origin, setOrigin] = usePanelState<ModelOrigin>(props, "origin", initialOrigin(params));
  const [ranWith, setRanWith] = usePanelState<DiscoveryRun | null>(props, "ranWith", null);
  const [mode, setMode] = usePanelState<PanelMode>(props, "mode", "view");
  // The graph lays out (or routes) a model only when it mounts, so every new model remounts it.
  const [loads, setLoads] = useState(0);
  const latestLoad = useRef(0);
  const [discovering, setDiscovering] = useState(false);
  const [pending, setPending] = useState<{ arcs: OCDeclareArc[]; run: DiscoveryRun } | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const { viz } = useViewerConfig({});

  const latest = useRef({ model, origin });
  latest.current = { model, origin };
  const settings = viewSettings(viewState);
  const hiddenArcTypes = useMemo(() => new Set(settings.hiddenArcTypes), [settings.hiddenArcTypes]);
  const hiddenObjectTypes = useMemo(() => new Set(settings.hiddenObjectTypes), [settings.hiddenObjectTypes]);

  const info = useQuery({
    queryKey: ["oc-declare-ocel", ocel],
    enabled: !!ocel,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () => ocDeclarePanelExtras(backend, ocel as string),
  });
  const eventTypeCounts = info.data?.eventTypeCounts;
  const objectTypeCounts = info.data?.objectTypeCounts;
  const involvements = info.data?.activityInvolvements;
  const eventTypes = useMemo(() => Object.keys(eventTypeCounts ?? {}), [eventTypeCounts]);
  const objectTypes = useMemo(() => Object.keys(objectTypeCounts ?? {}), [objectTypeCounts]);
  const relatedTypes = useMemo(
    () =>
      involvements
        ? (activity: string) =>
            Object.fromEntries(
              Object.entries(involvements[activity] ?? {}).map(([objectType, c]) => [
                objectType,
                c?.max ?? 0,
              ]),
            )
        : undefined,
    [involvements],
  );

  const arcs = useMemo(() => toArcs(model), [model]);
  const modelKey = useMemo(() => contentKey(model), [model]);
  const hasModel = model.nodes.length > 0;
  const hidden = hiddenActivitiesOf(view);
  const projected = mode === "view" && isProjected(arcs, hidden);
  const projection = useQuery({
    queryKey: ["oc-declare-projection", modelKey, hidden],
    enabled: projected,
    // Another model's projection is no placeholder for this one.
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[1] === modelKey ? prev : undefined),
    queryFn: async () =>
      (await backend.callBinding(OC_DECLARE_PROJECT, {
        arcs: arcs as unknown as ClientArc[],
        activities: projectionTargets(arcs, hidden),
        reduction: "Lossless",
      })) as unknown as OCDeclareArc[],
  });
  const shownBase = useMemo(
    () => (projected && projection.data ? arcsToModel(projection.data) : model),
    [projected, projection.data, model],
  );
  const shown = useMemo(() => withEvaluation(shownBase, evaluation, ocel), [shownBase, evaluation, ocel]);
  const editValue = useMemo(() => withEvaluation(model, evaluation, ocel), [model, evaluation, ocel]);
  // A projection is a new model with new ids, so each one gets a fresh graph.
  const shownKey = useMemo(() => (projected ? contentKey(shownBase) : "full"), [projected, shownBase]);

  const current: DiscoveryRun | null = ocel ? { ocel, options: controls } : null;
  const buttonState = discoverButton(ranWith, current, origin, hasModel);

  const replaceModel = (next: DeclareFlowModel, nextOrigin: ModelOrigin) => {
    setModel(next);
    setOrigin(nextOrigin);
    setEvaluation(null);
    latestLoad.current += 1;
    setLoads(latestLoad.current);
  };
  // Stable, so the graph's layout callbacks keep their identity. The origin is written only on change,
  // since each write saves the session.
  const change = useCallback(
    (next: DeclareFlowModel) => {
      const clean = withoutMarks(next);
      const nextOrigin = originAfterChange(latest.current.model, clean, latest.current.origin);
      if (nextOrigin !== latest.current.origin) setOrigin(nextOrigin);
      setModel(clean);
    },
    [setModel, setOrigin],
  );
  // A replaced graph can land a layout before it unmounts, and must not write its model back.
  const changeFromLoad = useMemo(() => {
    const load = loads;
    return (next: DeclareFlowModel) => {
      if (load === latestLoad.current) change(next);
    };
  }, [loads, change]);
  // While projected, the full model is off screen and keeps the old arrangement, so it is laid out
  // again when shown.
  const relayoutHidden = () => {
    if (projected) setModel(withoutLayout(latest.current.model));
  };

  const discover = async () => {
    if (!current) return;
    setDiscovering(true);
    try {
      const found = (await backend.callBinding(OC_DECLARE_DISCOVER, {
        locel: current.ocel as SlimLinkedOCELHandle,
        options: current.options,
      })) as unknown as OCDeclareArc[];
      // Discovery can take a while, so decide on the model as it is now, not at the click.
      const now = latest.current;
      if (asksBeforeReplace(now.origin, now.model.nodes.length > 0))
        setPending({ arcs: found, run: current });
      else {
        setRanWith(current);
        replaceModel(arcsToModel(found), "discovered");
      }
    } catch (e) {
      toast.error(`Discovery failed: ${String(e)}`);
    } finally {
      setDiscovering(false);
    }
  };

  const evaluate = async () => {
    if (!ocel) return;
    setEvaluating(true);
    try {
      const base = shownBase;
      const shownArcs = toArcs(base);
      const violations = await violationFractions(backend, ocel, shownArcs);
      setEvaluation({
        key: contentKey(base),
        ocel,
        violations: Object.fromEntries(shownArcs.map((a, i) => [arcKey(a), violations[i]])),
      });
    } catch (e) {
      toast.error(`Evaluation failed: ${String(e)}`);
    } finally {
      setEvaluating(false);
    }
  };

  const switchMode = (next: PanelMode) => {
    if (next === mode) return;
    if (next === "edit") setViewState(viewStateForEdit(viewState));
    setMode(next);
  };

  const vizProps = {
    viz,
    direction: settings.direction,
    onDirectionChange: (direction: "RIGHT" | "DOWN") => {
      relayoutHidden();
      setViewState({ ...viewState, layoutDirection: direction });
    },
    showTextLabels: settings.textLabels,
    onShowTextLabelsChange: (on: boolean) => {
      relayoutHidden();
      setViewState({ ...viewState, showTextLabels: on });
    },
    hiddenArcTypes,
    onHiddenArcTypesChange: (next: Set<string>) => setViewState({ ...viewState, hiddenArcTypes: [...next] }),
    hiddenObjectTypes,
    onHiddenObjectTypesChange: (next: Set<string>) =>
      setViewState({ ...viewState, hiddenObjectTypes: [...next] }),
    eventTypes,
    objectTypes,
    eventTypeCounts,
    objectTypeCounts,
    activityInvolvements: involvements,
    relatedTypes,
    activityPicker: false,
  };

  const discoverLabel = discovering
    ? "Discovering..."
    : buttonState === "rerun"
      ? "Re-run"
      : buttonState === "up-to-date"
        ? "Up to date"
        : "Discover";
  const discoverButtonEl = (
    <Button
      size="1"
      color={buttonState === "rerun" ? "amber" : "gray"}
      variant={buttonState === "rerun" ? "solid" : "soft"}
      disabled={!ocel || discovering || buttonState === "up-to-date"}
      onClick={() => void discover()}
    >
      {buttonState === "rerun" && !discovering ? <PiArrowsClockwise /> : null}
      {discoverLabel}
    </Button>
  );
  const evaluateButtonEl = (
    <Button
      size="1"
      variant="soft"
      color="grass"
      disabled={!ocel || !hasModel || evaluating}
      onClick={() => void evaluate()}
    >
      <PiLightning /> {evaluating ? "Evaluating..." : "Evaluate"}
    </Button>
  );
  const marked = (mode === "edit" ? editValue : shown).edges.some((e) => e.violation !== undefined);

  let body: React.ReactNode;
  if (!hasModel && origin !== "edited") {
    body = (
      <Flex
        direction="column"
        align="center"
        justify="center"
        gap="3"
        style={{ height: "100%", padding: 24, textAlign: "center" }}
      >
        <PiListBullets size={40} style={{ color: "var(--gray-8)" }} />
        <Text size="3" weight="medium">
          No model yet
        </Text>
        <Text size="2" color="gray" style={{ maxWidth: 360 }}>
          Discover constraints from the OCEL or start with an empty model.
        </Text>
        <Flex gap="2">
          <Button size="2" disabled={!ocel || discovering} onClick={() => void discover()}>
            {discovering ? "Discovering..." : "Discover"}
          </Button>
          <Button
            size="2"
            variant="soft"
            onClick={() => {
              replaceModel(EMPTY_MODEL, "edited");
              setMode("edit");
            }}
          >
            Start empty
          </Button>
        </Flex>
        {!ocel ? (
          <Text size="1" color="gray">
            Load an OCEL to discover
          </Text>
        ) : null}
      </Flex>
    );
  } else if (mode === "edit") {
    body = (
      <OCDeclareViz
        key={`edit-${loads}`}
        editable
        value={editValue}
        onChange={changeFromLoad}
        {...vizProps}
      />
    );
  } else {
    body = (
      <OCDeclareViz
        key={`view-${loads}-${shownKey}`}
        editable
        editTools={false}
        value={shown}
        onChange={projected ? undefined : changeFromLoad}
        onHideActivity={(a) =>
          setViewState({ ...viewState, [OC_DECLARE_HIDDEN_ACTIVITIES_KEY]: [...new Set([...hidden, a])] })
        }
        onFocusActivity={(a) =>
          setViewState({ ...viewState, [OC_DECLARE_HIDDEN_ACTIVITIES_KEY]: focusHidden(arcs, a) })
        }
        {...vizProps}
      />
    );
  }

  return (
    <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column" }}>
      <div data-export-ignore style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch" }}>
        {selector}
        <OCDeclareBar
          value={controls}
          onChange={setControls}
          ocel={ocel}
          view={view}
          arcs={hasModel ? arcs : undefined}
          showDisabled={mode === "edit"}
        />
        <Flex align="center" gap="2" px="2" py="1" style={barCell}>
          {ocel ? discoverButtonEl : <Tooltip content="Load an OCEL to discover">{discoverButtonEl}</Tooltip>}
          {ocel ? evaluateButtonEl : <Tooltip content="Load an OCEL to evaluate">{evaluateButtonEl}</Tooltip>}
          {marked ? (
            <Tooltip content="Clear evaluation">
              <IconButton
                size="1"
                variant="ghost"
                color="gray"
                aria-label="Clear evaluation"
                onClick={() => setEvaluation(null)}
              >
                <PiX />
              </IconButton>
            </Tooltip>
          ) : null}
          <SegmentedControl.Root size="1" value={mode} onValueChange={(m) => switchMode(m as PanelMode)}>
            <SegmentedControl.Item value="view">View</SegmentedControl.Item>
            <SegmentedControl.Item value="edit">Edit</SegmentedControl.Item>
          </SegmentedControl.Root>
        </Flex>
        <Flex align="center" gap="2" px="2" style={{ ...barCell, marginLeft: "auto", paddingRight: 48 }}>
          <OCDeclareModelActions model={model} onLoad={(next) => replaceModel(next, "loaded")} />
        </Flex>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>{body}</div>
      <ReplaceModelDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        onReplace={() => {
          if (pending) {
            setRanWith(pending.run);
            replaceModel(arcsToModel(pending.arcs), "discovered");
          }
          setPending(null);
        }}
        onAdd={() => {
          if (pending) {
            setRanWith(pending.run);
            replaceModel(
              mergeArcs(model, newArcs(model, pending.arcs), () => crypto.randomUUID()),
              "edited",
            );
          }
          setPending(null);
        }}
      />
    </div>
  );
}
