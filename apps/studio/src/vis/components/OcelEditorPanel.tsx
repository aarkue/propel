import { useState } from "react";
import { EMPTY_OCEL, fromOcelJson, OcelEditor, toOcelJson, type OcelModel } from "@r4pm/components";
import { Button, DropdownMenu, TextField } from "@r4pm/components/ui";
import type { SlimLinkedOCELHandle } from "@r4pm/client";
import { PiDownloadSimple, PiFloppyDisk } from "react-icons/pi";
import { backend } from "../../backends";
import { useDatasets } from "../../stores";

const FROM_JSON = "app_bindings::ocel::ocel_from_json" as const;
const TO_JSON = "app_bindings::ocel::ocel_to_json" as const;
const OCEL_KINDS = new Set(["OCEL", "SlimLinkedOCEL", "IndexLinkedOCEL"]);

/** Studio "create new OCEL" panel: the pure editor plus backend Save (register as a SlimLinkedOCEL
 *  dataset) and Import-to-seed (load an existing OCEL back into the editor). */
export function OcelEditorPanel() {
  const [model, setModel] = useState<OcelModel>(EMPTY_OCEL);
  const [name, setName] = useState("OCEL");
  const [busy, setBusy] = useState(false);
  const datasets = useDatasets((s) => s.datasets);
  const sources = datasets.filter((d) => OCEL_KINDS.has(d.kind));

  const empty = model.events.length === 0 && model.objects.length === 0;

  const save = async () => {
    if (empty || busy) return;
    setBusy(true);
    try {
      const input = toOcelJson(model);
      const handle = (await backend.callBinding(FROM_JSON, { input })) as string;
      useDatasets.getState().addDataset({
        id: handle,
        kind: "SlimLinkedOCEL",
        label: `${name.trim() || "OCEL"} (${model.events.length} ev · ${model.objects.length} ob)`,
      });
    } finally {
      setBusy(false);
    }
  };

  const seedFrom = async (id: string) => {
    setBusy(true);
    try {
      const json = await backend.callBinding(TO_JSON, { ocel: id as SlimLinkedOCELHandle });
      setModel(fromOcelJson(json));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OcelEditor
      model={model}
      onChange={setModel}
      actions={
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <TextField.Root
            size="1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="dataset name"
            aria-label="Dataset name"
            style={{ width: 120 }}
          />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <Button size="1" variant="soft" color="gray" disabled={busy || sources.length === 0}>
                <PiDownloadSimple size={13} /> Import
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content>
              <DropdownMenu.Label>Seed from OCEL</DropdownMenu.Label>
              {sources.map((d) => (
                <DropdownMenu.Item key={d.id} onSelect={() => seedFrom(d.id)}>
                  {d.label}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
          <Button size="1" onClick={save} disabled={empty || busy}>
            <PiFloppyDisk size={13} /> Save
          </Button>
        </div>
      }
    />
  );
}
