// The "Run" dialog: calls `onRun(blueprint, connections)` and renders its result -- a small
// results panel (entities emitted per mapping, `deduplicated` counts, per-`DropReason` counts).
// `onRun`'s return is a bare `string` handle, not a typed `SlimLinkedOCELHandle` -- this package
// has no @r4pm/client dependency, so it cannot know or care about `Handle<"SlimLinkedOCEL">`; the
// host wires the real `callBinding` call and hands back only what this dialog needs to display.
import { Badge, Button, Callout, Dialog, Flex, IconButton, Table, Text } from "@r4pm/components/ui";
import { useState } from "react";
import { PiCheckCircle, PiX } from "react-icons/pi";
import { toBlueprint } from "../model";
import { DROP_REASON_INFO, dropReasonLabel, dropReasonRows, totalDropped } from "./results-format";
import type { ExtractionReport } from "../types";
import { useEditContext } from "./edit-context";

/** Human-scaled duration: milliseconds under a second, then seconds, then minutes -- so a 90-second
 *  run reads "1m 30s" rather than "90000 ms". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

/** Entities the run actually produced, summed over its mappings. */
function countEntities(report: ExtractionReport): number {
  return report.per_mapping.reduce((sum, s) => sum + s.entities_emitted, 0);
}

export function RunPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const edit = useEditContext();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    ocelHandle: string;
    /** Absent on a run path that cannot produce one -- see `BlueprintEditCallbacks.onRun`. */
    report?: ExtractionReport;
    datasetLabel?: string;
    /** Measured here, around the whole call: what the user actually waited for, including moving
     *  the result across the bindings boundary. The report's own timing covers only the engine
     *  side, so the gap between the two is the transport. */
    wallClockMs: number;
  } | null>(null);
  if (!edit) return null;
  const { onRun } = edit.callbacks;
  if (!onRun) return null;

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const startedAt = performance.now();
      const r = await onRun(toBlueprint(edit.model), edit.connections, edit.catalog);
      setResult({ ...r, wallClockMs: Math.round(performance.now() - startedAt) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="640px">
        <Flex justify="between" align="center" mb="2">
          <Dialog.Title mb="0">Run extraction</Dialog.Title>
          <Dialog.Close>
            <IconButton size="1" variant="ghost" color="gray">
              <PiX />
            </IconButton>
          </Dialog.Close>
        </Flex>
        <Flex gap="2" align="center">
          <Button size="1" disabled={running} onClick={() => void run()}>
            {running ? "Running..." : "Run"}
          </Button>
        </Flex>
        {result && (
          <Callout.Root color="green" size="1" mt="2">
            <Callout.Icon>
              <PiCheckCircle />
            </Callout.Icon>
            <Callout.Text>
              {result.report
                ? `Extracted ${countEntities(result.report).toLocaleString("en")} entities into `
                : "Extracted into "}
              <strong>{result.datasetLabel ?? result.ocelHandle}</strong>
              {result.datasetLabel && ", now in your dataset list"} in {formatDuration(result.wallClockMs)}.
              {result.report?.timing && (
                <span className="opacity-70">
                  {" "}
                  ({formatDuration(result.report.timing.discovery_ms)} connecting and reading schemas,{" "}
                  {formatDuration(result.report.timing.extraction_ms)} extracting
                  {result.wallClockMs >
                  result.report.timing.discovery_ms + result.report.timing.extraction_ms + 50
                    ? `, ${formatDuration(result.wallClockMs - result.report.timing.discovery_ms - result.report.timing.extraction_ms)} transferring`
                    : ""}
                  )
                </span>
              )}
            </Callout.Text>
          </Callout.Root>
        )}
        {error && (
          <Text size="1" color="red" as="div" mt="2">
            {error}
          </Text>
        )}
        {result && !result.report && (
          <Text size="1" color="gray" as="div" mt="3">
            Per-mapping counts and drop reasons are not available on this run path, so nothing here is a claim
            that no rows were dropped. Validate the blueprint to catch what a report would otherwise have told
            you.
          </Text>
        )}
        {result?.report && (
          <div style={{ marginTop: 12 }}>
            <Table.Root size="1">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Mapping</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Rows read</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Emitted</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Deduplicated</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Dropped</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {result.report.per_mapping.map((stats, i) => {
                  const drops = dropReasonRows(stats);
                  return (
                    <Table.Row key={i}>
                      <Table.Cell>{stats.mapping.label ?? stats.mapping.path}</Table.Cell>
                      <Table.Cell>{stats.rows_read.toLocaleString("en")}</Table.Cell>
                      <Table.Cell>{stats.entities_emitted.toLocaleString("en")}</Table.Cell>
                      <Table.Cell>{stats.deduplicated.toLocaleString("en")}</Table.Cell>
                      <Table.Cell>
                        {/* Zero drops reads as clean -- no row, no badge, not an empty-but-present warning. */}
                        {drops.length === 0
                          ? "-"
                          : drops.map((d) => (
                              <Badge
                                key={d.reason}
                                color={d.reason === "PredicateExcluded" ? "gray" : "amber"}
                                mr="1"
                                title={DROP_REASON_INFO[d.reason]?.why ?? d.reason}
                              >
                                {dropReasonLabel(d.reason)}: {d.count.toLocaleString()}
                              </Badge>
                            ))}
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Root>
            <Text size="1" color="gray" mt="2" as="div">
              {result.report.rows_materialized.toLocaleString("en")} rows materialized across Join/Union
              buffering; total dropped:{" "}
              {result.report.per_mapping.reduce((sum, s) => sum + totalDropped(s), 0).toLocaleString("en")}
            </Text>
          </div>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}
