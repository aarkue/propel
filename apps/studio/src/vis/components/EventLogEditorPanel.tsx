import type { EventLogHandle } from "@r4pm/client";
import { EMPTY_LOG, EventLogEditor, fromLogJson, toLogJson, type EventLogModel } from "@r4pm/components";
import { Button, DropdownMenu, TextField } from "@r4pm/components/ui";
import { useState } from "react";
import { FaHammer } from "react-icons/fa";
import { PiDownloadSimple } from "react-icons/pi";
import { backend } from "../../backends";
import { useDatasets } from "../../stores";

const FROM_JSON = "app_bindings::event_log::event_log_from_json" as const;
const TO_JSON = "app_bindings::event_log::event_log_to_json" as const;

/** Studio "create new event log" panel: the pure editor plus backend Save (register as a dataset)
 *  and Import-to-seed (load an existing EventLog back into the editor). */
export function EventLogEditorPanel() {
  const [model, setModel] = useState<EventLogModel>(EMPTY_LOG);
  const [name, setName] = useState("Event Log");
  const [busy, setBusy] = useState(false);
  const datasets = useDatasets((s) => s.datasets);
  const sources = datasets.filter((d) => d.kind === "EventLog");

  const caseCount = new Set(model.rows.map((r) => r.caseId)).size;
  const empty = model.rows.length === 0;

  const save = async () => {
    if (empty || busy) return;
    setBusy(true);
    try {
      const log = toLogJson(model);
      const handle = (await backend.callBinding(FROM_JSON, { log })) as string;
      useDatasets.getState().addDataset({
        id: handle,
        kind: "EventLog",
        label: `${name.trim() || "Event Log"} (${caseCount} case${caseCount === 1 ? "" : "s"})`,
      });
    } finally {
      setBusy(false);
    }
  };

  const seedFrom = async (id: string) => {
    setBusy(true);
    try {
      const json = await backend.callBinding(TO_JSON, { event_log: id as EventLogHandle });
      setModel(fromLogJson(json));
    } finally {
      setBusy(false);
    }
  };

  return (
    <EventLogEditor
      model={model}
      onChange={setModel}
      actions={
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <Button size="1" variant="soft" color="gray" disabled={busy || sources.length === 0}>
                <PiDownloadSimple size={13} /> Import
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content>
              <DropdownMenu.Label>Seed from event log</DropdownMenu.Label>
              {sources.map((d) => (
                <DropdownMenu.Item key={d.id} onSelect={() => seedFrom(d.id)}>
                  {d.label}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
          <TextField.Root
            size="1"
            className="ml-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="dataset name"
            aria-label="Dataset name"
            style={{ width: 70 }}
          />
          <Button variant="soft" size="1" onClick={save} disabled={empty || busy}>
            <FaHammer size={13} /> Generate
          </Button>
        </div>
      }
    />
  );
}
