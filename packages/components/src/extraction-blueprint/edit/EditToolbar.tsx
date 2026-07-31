// The canvas toolbars. Left: add a table, connections, blueprint settings, auto-layout. Right:
// validation status, compile, run, clear -- the same split OCPQ had, where "what do I build with"
// sits on one side and "what do I do with it" on the other. Every backend-calling action is
// optional-callback-driven: a missing callback hides its own affordance, mirroring
// oc-declare/edit/EditToolbar.tsx's `onDiscover`/`onEvaluate` pattern.
import { Badge, Button, Flex, Popover, Select, Separator, Text } from "@r4pm/components/ui";
import { useState } from "react";
import {
  PiCheckCircle,
  PiCode,
  PiFloppyDisk,
  PiGear,
  PiPlay,
  PiPlugsConnected,
  PiTrash,
  PiTreeStructure,
  PiWarningCircle,
} from "react-icons/pi";
import { toBlueprint, type EditorBlueprint } from "../model";
import type { DuplicateObjectPolicy, IdRendering, MissingEndpointPolicy } from "../types";
import { AddTableMenu, type TableRef } from "./AddTableMenu";
import { BlueprintFileDialog } from "./BlueprintFileDialog";
import { CompilePanel } from "./CompilePanel";
import { useEditContext } from "./edit-context";
import { RunPanel } from "./RunPanel";

export function LeftToolbar({
  onAddTable,
  onImport,
}: {
  onAddTable: (ref: TableRef) => void;
  onImport: (model: EditorBlueprint, connections?: Record<string, string>) => void;
}) {
  const edit = useEditContext();

  const [fileOpen, setFileOpen] = useState(false);
  if (!edit) return null;

  return (
    <Flex align="center" gap="2">
      <AddTableMenu catalog={edit.catalog} onSelect={onAddTable} />

      <Button size="1" variant="surface" color="gray" onClick={() => setFileOpen(true)}>
        <PiFloppyDisk /> File
      </Button>

      <Button size="1" variant="surface" color="gray" onClick={() => edit.onOpenConnections()}>
        <PiPlugsConnected /> Connections
      </Button>

      <BlueprintSettings />

      <Button size="1" variant="surface" color="gray" title="Auto-layout" onClick={() => edit.runLayout()}>
        <PiTreeStructure /> Layout
      </Button>

      <BlueprintFileDialog open={fileOpen} onOpenChange={setFileOpen} onImport={onImport} />
    </Flex>
  );
}

export function RightToolbar({ onClear }: { onClear: () => void }) {
  const edit = useEditContext();
  const [runOpen, setRunOpen] = useState(false);
  const [compileOpen, setCompileOpen] = useState(false);
  const [validating, setValidating] = useState(false);
  if (!edit) return null;
  const { model, errors, callbacks, catalog } = edit;
  const mappingCount = model.mappings.length;

  const runValidate = async () => {
    if (!callbacks.onValidate) return;
    setValidating(true);
    try {
      await callbacks.onValidate(toBlueprint(model), catalog);
    } finally {
      setValidating(false);
    }
  };

  return (
    <Flex align="center" gap="2">
      {callbacks.onValidate && (
        <Button
          size="1"
          variant="surface"
          color="gray"
          disabled={validating}
          onClick={() => void runValidate()}
        >
          {errors.length === 0 ? (
            <PiCheckCircle color="var(--green-9)" />
          ) : (
            <PiWarningCircle color="var(--red-9)" />
          )}
          {errors.length === 0 ? "Valid" : `${errors.length} issue${errors.length === 1 ? "" : "s"}`}
        </Button>
      )}

      {callbacks.onCompile && (
        <Button size="1" variant="surface" color="gray" onClick={() => setCompileOpen(true)}>
          <PiCode /> Compile
        </Button>
      )}

      {callbacks.onRun && (
        <Button
          size="1"
          variant="solid"
          color="grass"
          disabled={mappingCount === 0}
          title={mappingCount === 0 ? "Add at least one mapping first" : undefined}
          onClick={() => setRunOpen(true)}
        >
          <PiPlay /> Extract OCEL
          {mappingCount > 0 && ` (${mappingCount})`}
        </Button>
      )}

      {(model.nodes.length > 0 || mappingCount > 0) && (
        <Button size="1" variant="surface" color="gray" onClick={onClear}>
          <PiTrash /> Clear
        </Button>
      )}

      {callbacks.onRun && <RunPanel open={runOpen} onOpenChange={setRunOpen} />}
      {callbacks.onCompile && <CompilePanel open={compileOpen} onOpenChange={setCompileOpen} />}
    </Flex>
  );
}

/** The three blueprint-level policies. They change what every mapping means, so they live in one
 *  place rather than being repeated per mapping. */
function BlueprintSettings() {
  const edit = useEditContext();
  if (!edit) return null;
  const { model, mutate } = edit;
  return (
    <Popover.Root>
      <Popover.Trigger>
        <Button size="1" variant="surface" color="gray" title="Blueprint settings">
          <PiGear /> Settings
        </Button>
      </Popover.Trigger>
      <Popover.Content size="1" width="330px">
        <Flex direction="column" gap="3">
          <SettingRow
            label="Id rendering"
            hint="Type-prefixed makes ids from different types unable to collide, but then every relation endpoint must declare its type."
          >
            <Select.Root
              size="1"
              value={model.idRendering}
              onValueChange={(v) => mutate((m) => ({ ...m, idRendering: v as IdRendering }))}
            >
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="raw">Raw</Select.Item>
                <Select.Item value="type-prefixed">Type-prefixed</Select.Item>
              </Select.Content>
            </Select.Root>
          </SettingRow>
          <Separator size="4" />
          <SettingRow
            label="Missing relation endpoint"
            hint="What to do when a relation names an entity no mapping produced. Create requires the endpoint to declare its type."
          >
            <Select.Root
              size="1"
              value={model.onMissingEndpoint}
              onValueChange={(v) => mutate((m) => ({ ...m, onMissingEndpoint: v as MissingEndpointPolicy }))}
            >
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="drop">Drop the relation</Select.Item>
                <Select.Item value="create">Create the object</Select.Item>
                <Select.Item value="error">Record an error</Select.Item>
              </Select.Content>
            </Select.Root>
          </SettingRow>
          <Separator size="4" />
          <SettingRow label="Duplicate object id" hint="What to do when an object id is produced twice.">
            <Select.Root
              size="1"
              value={model.onDuplicateObject}
              onValueChange={(v) => mutate((m) => ({ ...m, onDuplicateObject: v as DuplicateObjectPolicy }))}
            >
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="first-wins">Keep the first</Select.Item>
                <Select.Item value="error">Record an error</Select.Item>
              </Select.Content>
            </Select.Root>
          </SettingRow>
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <Flex direction="column" gap="1">
      <Text size="1" weight="medium">
        {label}
      </Text>
      {children}
      <Text size="1" color="gray" style={{ fontSize: 10, lineHeight: 1.35 }}>
        {hint}
      </Text>
    </Flex>
  );
}

export function GlobalErrorBanner({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <div
      style={{
        pointerEvents: "none",
        background: "var(--red-a3)",
        border: "1px solid var(--red-a6)",
        borderRadius: 6,
        padding: "4px 8px",
        maxWidth: 420,
      }}
    >
      {messages.map((m, i) => (
        <Text key={i} size="1" color="red" as="div">
          {m}
        </Text>
      ))}
    </div>
  );
}

export function ValidationBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Badge color="red" size="1">
      {count}
    </Badge>
  );
}
