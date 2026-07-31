// The "Compile" dialog: calls `onCompile(blueprint, catalog, shape)` and renders the resulting
// SQL. Mirrors RunPanel.tsx's layout, loading and error-state conventions (a Dialog with a
// disabled-while-busy trigger button, a red inline error line on throw), but the *content* of a
// successful result is shaped differently, because a compile is never wholesale pass/fail the way
// a run is:
//
//  - `errors()` names mappings the compiler skipped, one per line, alongside the SQL for
//    everything else -- never a toast, since it would disappear while the omission it describes
//    stays permanent in the emitted views.
//  - `probes()` are SQL that must return zero rows for the views to agree with the extractor; a
//    non-empty result means the views are lying for that case, not that something is broken, so
//    each one carries a one-line explanation rather than being surfaced as an error.
import {
  Badge,
  Button,
  Callout,
  Dialog,
  Flex,
  IconButton,
  Select,
  Text,
  TextArea,
} from "@r4pm/components/ui";
import { useState } from "react";
import { PiCheck, PiCopy, PiWarningCircle, PiX } from "react-icons/pi";
import { toBlueprint } from "../model";
import type { CompiledOcel, EmissionShape } from "../types";
import { useEditContext } from "./edit-context";
import {
  compiledDdl,
  compiledProbeStatements,
  describeCompileErrorTarget,
  describeMappingTarget,
  describeProbeKind,
  describeRejectReason,
} from "./compile-format";

const SHAPES: { value: EmissionShape; label: string; hint: string }[] = [
  { value: "PerType", label: "Per type", hint: "one view per declared event/object type (OCEL 2.0 layout)" },
  { value: "Consolidated", label: "Consolidated", hint: "one events/objects table, type as a column value" },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="1"
      variant="soft"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {copied ? <PiCheck /> : <PiCopy />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export function CompilePanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const edit = useEditContext();
  const [shape, setShape] = useState<EmissionShape>("PerType");
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompiledOcel | null>(null);
  if (!edit) return null;
  const { onCompile } = edit.callbacks;
  if (!onCompile) return null;

  const compile = async () => {
    setCompiling(true);
    setError(null);
    try {
      setResult(await onCompile(toBlueprint(edit.model), edit.catalog, shape));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCompiling(false);
    }
  };

  const probes = result ? compiledProbeStatements(result) : [];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="720px">
        <Flex justify="between" align="center" mb="2">
          <Dialog.Title mb="0">Compile to SQL</Dialog.Title>
          <Dialog.Close>
            <IconButton size="1" variant="ghost" color="gray">
              <PiX />
            </IconButton>
          </Dialog.Close>
        </Flex>

        <Flex gap="2" align="center">
          <Select.Root size="1" value={shape} onValueChange={(v) => setShape(v as EmissionShape)}>
            <Select.Trigger />
            <Select.Content>
              {SHAPES.map((s) => (
                <Select.Item key={s.value} value={s.value}>
                  {s.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <Text size="1" color="gray">
            {SHAPES.find((s) => s.value === shape)?.hint}
          </Text>
        </Flex>

        <Flex gap="2" align="center" mt="2">
          <Button size="1" disabled={compiling} onClick={() => void compile()}>
            {compiling ? "Compiling..." : "Compile"}
          </Button>
          {result && (
            <Badge color={result.views.length > 0 ? "green" : "gray"}>
              {result.views.length} relation{result.views.length === 1 ? "" : "s"}
            </Badge>
          )}
          {result && result.errors.length > 0 && (
            <Badge color="amber">
              {result.errors.length} mapping{result.errors.length === 1 ? "" : "s"} not compiled
            </Badge>
          )}
        </Flex>

        {error && (
          <Text size="1" color="red" as="div" mt="2">
            {error}
          </Text>
        )}

        {result && result.errors.length > 0 && (
          <Callout.Root color="amber" variant="surface" mt="3">
            <Callout.Icon>
              <PiWarningCircle />
            </Callout.Icon>
            <Callout.Text>
              <Text as="div" weight="medium" size="2" className="mb-1">
                {result.errors.length} mapping{result.errors.length === 1 ? "" : "s"} could not be compiled
              </Text>
              <Text as="div" size="1" className="opacity-90 mb-2">
                The rest of the blueprint still compiled below. The entities these mappings would have
                produced are missing from the SQL, even though a real extraction would include them.
              </Text>
              <Flex direction="column" gap="1">
                {result.errors.map((e, i) => (
                  <Text key={i} as="div" size="1">
                    <strong>{describeCompileErrorTarget(e)}</strong>: {describeRejectReason(e.reason)}
                  </Text>
                ))}
              </Flex>
            </Callout.Text>
          </Callout.Root>
        )}

        {result && (
          <div style={{ marginTop: 12 }}>
            <Flex justify="between" align="center" mb="1">
              <Text size="1" weight="medium">
                SQL ({result.views.length === 0 ? "no relations" : "CREATE VIEW"})
              </Text>
              {result.views.length > 0 && <CopyButton text={compiledDdl(result)} />}
            </Flex>
            <TextArea
              value={
                result.views.length > 0
                  ? compiledDdl(result)
                  : "-- No relations were compiled. See the errors above."
              }
              readOnly
              rows={14}
              style={{ fontFamily: "var(--code-font-family, monospace)" }}
            />
          </div>
        )}

        {probes.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Text size="1" weight="medium" as="div" mb="1">
              Probes ({probes.length})
            </Text>
            <Text size="1" color="gray" as="div" mb="2">
              Each must return zero rows for the SQL above to agree with what an actual extraction would
              produce. A non-empty result is not a bug in the SQL -- it means this blueprint's data hits a
              case the compiler could only detect by reading the data itself, and the views above disagree
              with the extractor for those rows.
            </Text>
            <Flex direction="column" gap="3">
              {probes.map(({ probe, sql }, i) => (
                <div key={i}>
                  <Flex justify="between" align="center" mb="1">
                    <Text size="1">
                      <strong>{describeMappingTarget(probe.mapping)}</strong>: {describeProbeKind(probe.kind)}
                    </Text>
                    <CopyButton text={sql} />
                  </Flex>
                  <TextArea
                    value={sql}
                    readOnly
                    rows={3}
                    style={{ fontFamily: "var(--code-font-family, monospace)" }}
                  />
                </div>
              ))}
            </Flex>
          </div>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}
