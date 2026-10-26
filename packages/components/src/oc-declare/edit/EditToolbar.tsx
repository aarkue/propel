import {
  Button,
  Dialog,
  Flex,
  IconButton,
  Popover,
  SegmentedControl,
  Tabs,
  TextArea,
} from "@r4pm/components/ui";
import { useReactFlow } from "@xyflow/react";
import { useEffect, useState } from "react";
import {
  PiCopy,
  PiDownloadSimple,
  PiLightning,
  PiPlus,
  PiRobotBold,
  PiTreeStructure,
  PiX,
} from "react-icons/pi";
import { downloadBlob } from "../../dfg/util/svg-export";
import type { OCDeclareArc } from "../index";
import { type DeclareFlowModel, type DeclareNode, mergeArcs, toArcs } from "../model";
import { FrequencyPicker } from "../../inputs/FrequencyPicker";
import { DISCOVERY_DEFAULTS } from "./discovery-summary";
import { DiscoveryForm } from "./DiscoveryForm";
import type { DiscoveryOptions } from "./edit-context";
import { useEditContext } from "./edit-context";
import { uid } from "../../shared/id";

/** Edit-mode toolbar: node palette (add), evaluate/clear, export, and layout. Each control that
 *  depends on an injected callback hides when that callback is absent. */
export function EditToolbar() {
  const edit = useEditContext();
  const rf = useReactFlow();
  const [exportOpen, setExportOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discoveryOptions, setDiscoveryOptions] = useState<DiscoveryOptions>(DISCOVERY_DEFAULTS);
  const [discovering, setDiscovering] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<DeclareNode["kind"]>("activity");
  const [evaluating, setEvaluating] = useState(false);
  if (!edit) return null;
  const { eventTypes, objectTypes, eventTypeCounts, objectTypeCounts } = edit.palette;
  const { onDiscover, onEvaluate, onTemplateString } = edit.callbacks;

  // Merge discovered arcs into the model, then re-layout (positionless additions get arranged).
  const mergeDiscovered = (arcs: OCDeclareArc[]) => {
    edit.mutate((m) => mergeArcs(m, arcs, () => uid()));
    edit.runLayout();
  };

  // One node per name, as rust4pm knows nodes by name. Placed, so the next mount keeps the layout.
  const add = (type: string, kind: DeclareNode["kind"]) =>
    edit.mutate((m) =>
      m.nodes.some((n) => n.type === type && n.kind === kind)
        ? m
        : { ...m, nodes: [...m.nodes, { id: uid(), type, kind, position: edit.newNodePosition() }] },
    );

  const addTypes = addKind === "activity" ? eventTypes : objectTypes;
  const addCounts = addKind === "activity" ? eventTypeCounts : objectTypeCounts;
  const addHasCounts = !!addCounts && addTypes.some((t) => (addCounts[t] ?? 0) > 0);

  const discover = async () => {
    if (!onDiscover) return;
    setDiscovering(true);
    try {
      mergeDiscovered(await onDiscover(discoveryOptions));
      setDiscoverOpen(false);
    } finally {
      setDiscovering(false);
    }
  };

  // Evaluate the selected edges (or all when none selected). Only edges with both endpoints present
  // produce an arc; the fractions come back aligned to that filtered list.
  const evaluate = async () => {
    if (!onEvaluate) return;
    const model = edit.model;
    const byId = new Map(model.nodes.map((n) => [n.id, n]));
    const selected = new Set(
      rf
        .getEdges()
        .filter((e) => e.selected)
        .map((e) => e.id),
    );
    const scope = selected.size > 0 ? model.edges.filter((e) => selected.has(e.id)) : model.edges;
    const valid = scope.filter((e) => byId.has(e.source) && byId.has(e.target));
    if (valid.length === 0) return;
    setEvaluating(true);
    try {
      const fractions = await onEvaluate(toArcs({ nodes: model.nodes, edges: valid }));
      const violByEdge = new Map<string, number>();
      valid.forEach((e, i) => {
        violByEdge.set(e.id, fractions[i]);
      });
      edit.mutate((m) => ({
        ...m,
        edges: m.edges.map((e) => (violByEdge.has(e.id) ? { ...e, violation: violByEdge.get(e.id) } : e)),
      }));
    } finally {
      setEvaluating(false);
    }
  };

  const clearEvaluation = () =>
    edit.mutate((m) => ({ ...m, edges: m.edges.map((e) => ({ ...e, violation: undefined })) }));

  return (
    <Flex align="center" style={{ gap: 6 }}>
      <Popover.Root open={addOpen} onOpenChange={setAddOpen}>
        <Popover.Trigger>
          <Button size="1" variant="surface" color="gray">
            <PiPlus /> Add
          </Button>
        </Popover.Trigger>
        <Popover.Content size="1" style={{ width: 300 }}>
          <SegmentedControl.Root
            size="1"
            value={addKind}
            onValueChange={(k) => setAddKind(k as DeclareNode["kind"])}
            style={{ width: "100%" }}
          >
            <SegmentedControl.Item value="activity">Activity</SegmentedControl.Item>
            <SegmentedControl.Item value="init">Object init</SegmentedControl.Item>
            <SegmentedControl.Item value="exit">Object exit</SegmentedControl.Item>
          </SegmentedControl.Root>
          <div className="mt-2">
            <FrequencyPicker
              key={addKind}
              items={Object.fromEntries(addTypes.map((t) => [t, addCounts?.[t] ?? 0]))}
              value={new Set()}
              onChange={(next) => {
                const [type] = next;
                if (type === undefined) return;
                add(type, addKind);
                setAddOpen(false);
              }}
              mode="single"
              scope={addKind === "activity" ? "activity" : "objectType"}
              searchable
              autoFocus
              showBars={addHasCounts}
              showCounts={addHasCounts}
              showCutoff={false}
              sort={addHasCounts ? "count" : "name"}
              emptyText={addKind === "activity" ? "No activities" : "No object types"}
            />
          </div>
        </Popover.Content>
      </Popover.Root>

      {onDiscover && (
        <Popover.Root open={discoverOpen} onOpenChange={setDiscoverOpen}>
          <Popover.Trigger>
            <Button size="1" variant="surface" color="iris">
              <PiRobotBold /> Discover
            </Button>
          </Popover.Trigger>
          <Popover.Content size="1" width="340px" onOpenAutoFocus={(e) => e.preventDefault()}>
            <DiscoveryForm
              value={discoveryOptions}
              onChange={setDiscoveryOptions}
              eventTypeCounts={Object.fromEntries(eventTypes.map((t) => [t, eventTypeCounts?.[t] ?? 0]))}
              objectTypeCounts={Object.fromEntries(objectTypes.map((t) => [t, objectTypeCounts?.[t] ?? 0]))}
            />
            <Flex justify="end" mt="2">
              <Button size="1" disabled={discovering} onClick={() => void discover()}>
                <PiRobotBold /> {discovering ? "Discovering..." : "Discover"}
              </Button>
            </Flex>
          </Popover.Content>
        </Popover.Root>
      )}

      {onEvaluate && (
        <>
          <Button size="1" variant="surface" color="grass" disabled={evaluating} onClick={evaluate}>
            <PiLightning /> Evaluate
          </Button>
          <Button size="1" variant="surface" color="gray" onClick={clearEvaluation}>
            Clear
          </Button>
        </>
      )}

      <Button size="1" variant="surface" color="gray" title="Auto-layout" onClick={() => edit.runLayout()}>
        <PiTreeStructure /> Layout
      </Button>

      <Button size="1" variant="surface" color="gray" onClick={() => setExportOpen(true)}>
        <PiDownloadSimple /> Export
      </Button>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        model={edit.model}
        onTemplateString={onTemplateString}
      />
    </Flex>
  );
}

/** Text (via `onTemplateString`) + JSON (`toArcs`) export with copy + download. */
function ExportDialog({
  open,
  onOpenChange,
  model,
  onTemplateString,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  model: DeclareFlowModel;
  onTemplateString?: (arcs: ReturnType<typeof toArcs>) => Promise<string>;
}) {
  const [text, setText] = useState("");
  const json = JSON.stringify(toArcs(model), null, 2);

  // Fetch the template string when the dialog opens. Keyed on `open`, because Radix fires
  // `onOpenChange` only for changes it initiates, and the toolbar opens this by setting `open`
  // itself.
  useEffect(() => {
    if (!open || !onTemplateString) return;
    let cancelled = false;
    setText("Loading…");
    onTemplateString(toArcs(model)).then(
      (t) => {
        if (!cancelled) setText(t);
      },
      (e) => {
        // Without this a rejection leaves "Loading…" on screen for good.
        if (!cancelled) setText(`Could not render the text export: ${e}`);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, onTemplateString, model]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="640px">
        <Flex justify="between" align="center" mb="2">
          <Dialog.Title mb="0">Export constraints</Dialog.Title>
          <Dialog.Close>
            <IconButton size="1" variant="ghost" color="gray">
              <PiX />
            </IconButton>
          </Dialog.Close>
        </Flex>
        <Tabs.Root defaultValue={onTemplateString ? "text" : "json"}>
          <Tabs.List>
            {onTemplateString && <Tabs.Trigger value="text">Text</Tabs.Trigger>}
            <Tabs.Trigger value="json">JSON</Tabs.Trigger>
          </Tabs.List>
          {onTemplateString && (
            <Tabs.Content value="text">
              <ExportPane content={text} filename="oc-declare.txt" />
            </Tabs.Content>
          )}
          <Tabs.Content value="json">
            <ExportPane content={json} filename="oc-declare.json" />
          </Tabs.Content>
        </Tabs.Root>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function ExportPane({ content, filename }: { content: string; filename: string }) {
  return (
    <Flex direction="column" gap="2" mt="2">
      <TextArea
        value={content}
        readOnly
        rows={12}
        style={{ fontFamily: "var(--code-font-family, monospace)" }}
      />
      <Flex gap="2" justify="end">
        <Button size="1" variant="soft" onClick={() => navigator.clipboard?.writeText(content)}>
          <PiCopy /> Copy
        </Button>
        <Button
          size="1"
          variant="soft"
          onClick={() => downloadBlob(new Blob([content], { type: "text/plain" }), filename)}
        >
          <PiDownloadSimple /> Download
        </Button>
      </Flex>
    </Flex>
  );
}
