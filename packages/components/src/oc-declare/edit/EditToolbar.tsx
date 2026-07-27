import { Button, Dialog, DropdownMenu, Flex, IconButton, Tabs, TextArea } from "@r4pm/components/ui";
import { useReactFlow } from "@xyflow/react";
import { useState } from "react";
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
import { DiscoveryPanel } from "./DiscoveryPanel";
import { useEditContext } from "./edit-context";
import { uid } from "../../shared/id";

/** Edit-mode toolbar: node palette (add), evaluate/clear, export, and layout. Each control that
 *  depends on an injected callback hides when that callback is absent. */
export function EditToolbar() {
  const edit = useEditContext();
  const rf = useReactFlow();
  const [exportOpen, setExportOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  if (!edit) return null;
  const { eventTypes, objectTypes } = edit.palette;
  const { onDiscover, onEvaluate, onTemplateString } = edit.callbacks;

  // Merge discovered arcs into the model, then re-layout (positionless additions get arranged).
  const mergeDiscovered = (arcs: OCDeclareArc[]) => {
    edit.mutate((m) => mergeArcs(m, arcs, () => uid()));
    edit.runLayout();
  };

  const add = (type: string, kind: DeclareNode["kind"]) =>
    edit.mutate((m) => ({ ...m, nodes: [...m.nodes, { id: uid(), type, kind }] }));

  const typeList = (types: string[], kind: DeclareNode["kind"]) =>
    types.length === 0 ? (
      <DropdownMenu.Item disabled>none</DropdownMenu.Item>
    ) : (
      types.map((t) => (
        <DropdownMenu.Item key={t} onSelect={() => add(t, kind)}>
          {t}
        </DropdownMenu.Item>
      ))
    );

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
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Button size="1" variant="surface" color="gray">
            <PiPlus /> Add
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content size="1">
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger>Activity</DropdownMenu.SubTrigger>
            <DropdownMenu.SubContent>{typeList(eventTypes, "activity")}</DropdownMenu.SubContent>
          </DropdownMenu.Sub>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger>Object Init</DropdownMenu.SubTrigger>
            <DropdownMenu.SubContent>{typeList(objectTypes, "init")}</DropdownMenu.SubContent>
          </DropdownMenu.Sub>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger>Object Exit</DropdownMenu.SubTrigger>
            <DropdownMenu.SubContent>{typeList(objectTypes, "exit")}</DropdownMenu.SubContent>
          </DropdownMenu.Sub>
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      {onDiscover && (
        <Button size="1" variant="surface" color="iris" onClick={() => setDiscoverOpen(true)}>
          <PiRobotBold /> Discover
        </Button>
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
      {onDiscover && (
        <DiscoveryPanel
          open={discoverOpen}
          onOpenChange={setDiscoverOpen}
          eventTypes={eventTypes}
          onDiscover={onDiscover}
          onResult={mergeDiscovered}
        />
      )}
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

  // Fetch the template string lazily when the dialog opens.
  const loadText = async () => {
    if (!onTemplateString) return;
    setText("Loading…");
    setText(await onTemplateString(toArcs(model)));
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) void loadText();
      }}
    >
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
