// Save/load a blueprint as JSON. Lives in the component package rather than the host so OCPQ gets
// it too, and so a blueprint can move between the two.
import { Button, Callout, Dialog, IconButton, Switch, Tabs, Text, TextArea } from "@r4pm/components/ui";
import { useId, useMemo, useRef, useState } from "react";
import {
  PiCheckCircle,
  PiClipboard,
  PiDownloadSimple,
  PiUploadSimple,
  PiWarningCircle,
  PiX,
} from "react-icons/pi";
import type { EditorBlueprint } from "../model";
import { exportBlueprint, importBlueprint, suggestFilename } from "./blueprint-file";
import { useEditContext } from "./edit-context";

export function BlueprintFileDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImport: (model: EditorBlueprint, connections?: Record<string, string>) => void;
}) {
  const edit = useEditContext();
  const [includeConnections, setIncludeConnections] = useState(false);
  const [pasted, setPasted] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const includeId = useId();
  // Every hook runs before the read-only bail-out, so the order stays stable across renders.
  const exported = useMemo(
    () =>
      edit
        ? exportBlueprint(edit.model, edit.connections, includeConnections)
        : { json: "", includedConnections: false },
    [edit, includeConnections],
  );
  if (!edit) return null;

  const hasConnections = Object.values(edit.connections).some(Boolean);

  const download = () => {
    const blob = new Blob([exported.json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = suggestFilename(edit.model);
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = () => {
    void navigator.clipboard?.writeText(exported.json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  const applyImport = (json: string) => {
    const result = importBlueprint(json);
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    setImportError(null);
    onImport(result.model, result.connections);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="640px" className="flex max-h-[86vh] flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Dialog.Title size="3" mb="1">
              Blueprint file
            </Dialog.Title>
            <Dialog.Description size="1" color="gray">
              A blueprint is a plain JSON document. Save one to keep, share or version it.
            </Dialog.Description>
          </div>
          <Dialog.Close>
            <IconButton size="1" variant="ghost" color="gray" aria-label="Close">
              <PiX />
            </IconButton>
          </Dialog.Close>
        </div>

        <Tabs.Root defaultValue="save" className="mt-3 flex min-h-0 flex-1 flex-col">
          <Tabs.List size="1">
            <Tabs.Trigger value="save">Save</Tabs.Trigger>
            <Tabs.Trigger value="load">Load</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="save" className="min-h-0 flex-1 overflow-y-auto pt-3">
            {hasConnections && (
              <div className="mb-2 flex items-start gap-2">
                <Switch
                  id={includeId}
                  size="1"
                  checked={includeConnections}
                  onCheckedChange={setIncludeConnections}
                />
                <label htmlFor={includeId} className="cursor-pointer">
                  <Text size="1" weight="medium" className="block">
                    Include connection strings
                  </Text>
                  <Text size="1" color="gray" className="block text-[10px] leading-snug">
                    A connection string may contain a password.
                  </Text>
                </label>
              </div>
            )}
            {exported.includedConnections && (
              <Callout.Root color="amber" size="1" mb="2">
                <Callout.Icon>
                  <PiWarningCircle />
                </Callout.Icon>
                <Callout.Text>
                  Contains connection strings, passwords included. Treat as a secret.
                </Callout.Text>
              </Callout.Root>
            )}
            <TextArea
              readOnly
              size="1"
              value={exported.json}
              rows={12}
              className="font-mono"
              aria-label="Blueprint JSON"
            />
            <div className="mt-2 flex gap-2">
              <Button size="1" onClick={download}>
                <PiDownloadSimple /> Download
              </Button>
              <Button size="1" variant="soft" onClick={copy}>
                {copied ? <PiCheckCircle /> : <PiClipboard />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </Tabs.Content>

          <Tabs.Content value="load" className="min-h-0 flex-1 overflow-y-auto pt-3">
            <Callout.Root color="amber" size="1" mb="2">
              <Callout.Icon>
                <PiWarningCircle />
              </Callout.Icon>
              <Callout.Text>Loading replaces the blueprint currently on the canvas.</Callout.Text>
            </Callout.Root>
            <TextArea
              size="1"
              rows={10}
              value={pasted}
              placeholder="Paste a blueprint JSON document here..."
              className="font-mono"
              aria-label="Blueprint JSON to load"
              onChange={(e) => {
                setPasted(e.target.value);
                setImportError(null);
              }}
            />
            {importError && (
              <Callout.Root color="red" size="1" mt="2">
                <Callout.Icon>
                  <PiWarningCircle />
                </Callout.Icon>
                <Callout.Text>{importError}</Callout.Text>
              </Callout.Root>
            )}
            <div className="mt-2 flex gap-2">
              <Button size="1" disabled={!pasted.trim()} onClick={() => applyImport(pasted)}>
                <PiUploadSimple /> Load
              </Button>
              <Button size="1" variant="soft" onClick={() => fileRef.current?.click()}>
                Choose a file...
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void file.text().then((text) => {
                    setPasted(text);
                    applyImport(text);
                  });
                  // Let the same file be chosen twice in a row.
                  e.target.value = "";
                }}
              />
            </div>
          </Tabs.Content>
        </Tabs.Root>
      </Dialog.Content>
    </Dialog.Root>
  );
}
