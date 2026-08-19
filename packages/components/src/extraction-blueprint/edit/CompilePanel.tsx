// The "Compile" dialog: calls `onCompile(blueprint, catalog, shape)` and renders the resulting
// SQL. Unlike RunPanel.tsx, a compile is never wholesale pass/fail: `errors()` names mappings
// the compiler skipped (shown inline, never a toast, since the omission is permanent), and
// `probes()` are SQL that must return zero rows for the views to agree with the extractor.
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
import type { CompiledOcel, EmissionShape, SqlDialect } from "../types";
import { Disclosure, InlineDisclosure } from "./Disclosure";
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

/** The engines the compiler can emit for. Not the same as the engines a *source* can be read from:
 *  this picks the SQL the views are written in, not where the data lives. */
const DIALECTS: { value: SqlDialect; label: string; hint: string }[] = [
  { value: "DuckDb", label: "DuckDB", hint: "checked row-for-row against the extractor" },
  { value: "Postgres", label: "PostgreSQL", hint: "same views; regex filters are not compiled" },
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
  const [dialect, setDialect] = useState<SqlDialect>("DuckDb");
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
      setResult(await onCompile(toBlueprint(edit.model), edit.catalog, shape, dialect));
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
          <Select.Root size="1" value={dialect} onValueChange={(v) => setDialect(v as SqlDialect)}>
            <Select.Trigger />
            <Select.Content>
              {DIALECTS.map((d) => (
                <Select.Item key={d.value} value={d.value}>
                  {d.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <Text size="1" color="gray">
            {DIALECTS.find((d) => d.value === dialect)?.hint}
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
                The rest compiled below; these mappings' entities are missing from the SQL.
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

        {/* Shut by default, and each probe's SQL shut inside it. The SQL a user came here for is the
            DDL above; the probes are a caveat about it, and rendering every one as an open textarea
            buried that DDL under a wall of queries that are usually not worth reading. The count is
            on the closed header, so "are there any?" is still answerable without opening it. */}
        {probes.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Disclosure
              title="Probes"
              count={probes.length}
              summary={probes.length === 1 ? "1 check" : `${probes.length} checks`}
            >
              <Text size="1" color="gray" as="div">
                Each should return zero rows. A non-empty result means the SQL disagrees with a real
                extraction for that case.
              </Text>
              <Flex direction="column" gap="2">
                {probes.map(({ probe, sql }, i) => (
                  <div key={i}>
                    <Flex justify="between" align="center" gap="2">
                      <Text size="1" className="min-w-0">
                        <strong>{describeMappingTarget(probe.mapping)}</strong>:{" "}
                        {describeProbeKind(probe.kind)}
                      </Text>
                      <CopyButton text={sql} />
                    </Flex>
                    <InlineDisclosure label="SQL">
                      <TextArea
                        value={sql}
                        readOnly
                        rows={3}
                        style={{ fontFamily: "var(--code-font-family, monospace)" }}
                      />
                    </InlineDisclosure>
                  </div>
                ))}
              </Flex>
            </Disclosure>
          </div>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}
