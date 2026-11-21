import { Button, Flex, Text } from "@r4pm/components/ui";
import { type ReactNode, useState } from "react";
import { PiCaretRight, PiCheckCircle, PiInfo, PiWarning, PiWrench } from "react-icons/pi";
import { fmtInt, Metric, MetricRow, type Option, OptionMenu, Section, Toolbar } from "../kit";
import { useViewSetting } from "../viewer/view-state";
import type { ViewerProps } from "../viewer/viewer-config";

export type HealthSeverity = "warning" | "info";

/** A way to repair what a check found: engine repairs to apply in order. */
export interface HealthFix {
  id: string;
  label: string;
  description: string;
  recommended: boolean;
  repairs: unknown[];
}

export interface HealthFinding {
  check: string;
  title: string;
  /** The kind of issue and what it concerns, e.g., "Imprecise time". */
  category: string;
  description: string;
  severity: HealthSeverity;
  count: number;
  examples: string[];
  fixes: HealthFix[];
}

export interface OcelHealth {
  num_events: number;
  num_objects: number;
  findings: HealthFinding[];
}

/** The fixes picked for a report, by check. */
export type ChosenFixes = Record<string, string>;

const SEVERITY: Record<HealthSeverity, { scale: string; icon: ReactNode; label: string }> = {
  warning: { scale: "amber", icon: <PiWarning />, label: "Warning" },
  info: { scale: "blue", icon: <PiInfo />, label: "Note" },
};

const LEAVE = "";

const recommendedFixes = (findings: HealthFinding[]): ChosenFixes =>
  Object.fromEntries(
    findings.flatMap((f) => {
      const fix = f.fixes.find((x) => x.recommended);
      return fix ? [[f.check, fix.id]] : [];
    }),
  );

/** The repairs of the chosen fixes, in the order of the findings. */
export function chosenRepairs(findings: HealthFinding[], chosen: ChosenFixes): unknown[] {
  return findings.flatMap((f) => f.fixes.find((x) => x.id === chosen[f.check])?.repairs ?? []);
}

function FixPicker({
  f,
  value,
  onChange,
}: {
  f: HealthFinding;
  value: string;
  onChange: (fix: string) => void;
}) {
  const options: Option<string>[] = [
    { value: LEAVE, label: "Leave as is", description: "No change for this finding" },
    ...f.fixes.map((x) => ({
      value: x.id,
      label: x.recommended ? `${x.label} (recommended)` : x.label,
      description: x.description,
    })),
  ];
  const picked = f.fixes.find((x) => x.id === value);
  return (
    <Flex direction="column" align="start" gap="1" mt="2">
      <OptionMenu label="Fix" value={picked ? value : LEAVE} options={options} onChange={onChange} />
      {picked && (
        <Text size="1" color="gray" style={{ maxWidth: 640 }}>
          {picked.description}
        </Text>
      )}
    </Flex>
  );
}

function FindingCard({
  f,
  total,
  noun = "items",
  fix,
}: {
  f: HealthFinding;
  total: number;
  noun?: string;
  fix?: ReactNode;
}) {
  const s = SEVERITY[f.severity];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "32px minmax(0, 1fr) auto",
        gap: 14,
        padding: "14px 16px",
        borderRadius: 12,
        background: "var(--color-panel-solid)",
        border: "1px solid var(--gray-a4)",
      }}
    >
      <span
        title={s.label}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 17,
          color: `var(--${s.scale}-11)`,
          background: `var(--${s.scale}-a3)`,
        }}
      >
        {s.icon}
      </span>
      <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
        <Flex align="center" gap="2" wrap="wrap">
          <Text size="3" weight="medium">
            {f.title}
          </Text>
          <span className="r4pm-eyebrow">{f.category}</span>
        </Flex>
        <Text size="2" color="gray" style={{ maxWidth: 720 }}>
          {f.description}
        </Text>
        {f.examples.length > 0 && (
          <Flex gap="1" wrap="wrap" mt="1" align="center">
            <Text size="1" color="gray" mr="1">
              For example
            </Text>
            {f.examples.map((e) => (
              <span
                key={e}
                style={{
                  fontFamily: "var(--code-font-family)",
                  fontSize: 12,
                  padding: "1px 7px",
                  borderRadius: 6,
                  background: "var(--gray-a3)",
                  color: "var(--gray-12)",
                  maxWidth: 360,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={e}
              >
                {e}
              </span>
            ))}
            {f.count > f.examples.length && (
              <Text size="1" color="gray">
                and {fmtInt(f.count - f.examples.length)} more
              </Text>
            )}
          </Flex>
        )}
        {fix}
      </Flex>
      <Flex direction="column" align="end" justify="start">
        <Text size="5" weight="bold" style={{ fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
          {fmtInt(f.count)}
        </Text>
        {total > 0 && f.count <= total && (
          <Text size="1" color="gray">
            {f.count / total < 0.001 ? "<0.1" : ((100 * f.count) / total).toFixed(1)}% of {noun}
          </Text>
        )}
      </Flex>
    </div>
  );
}

/** How many fixes are selected, presets for the selection, and the action that applies it. */
function FixBar({
  findings,
  chosen,
  setChosen,
  onRepair,
}: {
  findings: HealthFinding[];
  chosen: ChosenFixes;
  setChosen: (c: ChosenFixes | null) => void;
  onRepair: (repairs: unknown[]) => Promise<unknown> | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const fixable = findings.filter((f) => f.fixes.length > 0).length;
  const picked = findings.filter((f) => f.fixes.some((x) => x.id === chosen[f.check])).length;
  const recommended = recommendedFixes(findings);
  const same = (a: ChosenFixes, b: ChosenFixes) =>
    Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);
  const isRecommended = same(chosen, recommended);
  return (
    <Flex
      align="center"
      gap="2"
      wrap="wrap"
      style={{
        padding: "8px 8px 8px 14px",
        borderRadius: 10,
        background: "var(--gray-a2)",
        border: "1px solid var(--gray-a4)",
      }}
    >
      <PiWrench style={{ color: "var(--gray-10)" }} />
      <Text size="2">
        {picked} of {fixable} fix{fixable === 1 ? "" : "es"} selected
      </Text>
      <Flex align="center" gap="2" ml="auto">
        <Button size="1" variant="soft" color="gray" disabled={isRecommended} onClick={() => setChosen(null)}>
          Recommended
        </Button>
        <Button size="1" variant="soft" color="gray" disabled={picked === 0} onClick={() => setChosen({})}>
          None
        </Button>
        <Button
          size="1"
          disabled={picked === 0 || busy}
          onClick={() => {
            setBusy(true);
            Promise.resolve(onRepair(chosenRepairs(findings, chosen))).finally(() => setBusy(false));
          }}
        >
          <PiWrench />
          {busy ? "Repairing..." : "Create repaired copy"}
        </Button>
      </Flex>
    </Flex>
  );
}

export interface OcelHealthViewProps extends ViewerProps<OcelHealth> {
  /** What the data is called, e.g., "event log". */
  subject?: string;
  /** What `num_objects` counts, e.g., cases. */
  unit?: string;
  /** What a finding's count is a share of, e.g., events or cases; default all events and objects. */
  totalOf?: (f: HealthFinding) => { total: number; noun: string };
  /** Applies the repairs of the picked fixes, e.g., to a new copy of the data. */
  onRepair?: (repairs: unknown[]) => Promise<unknown> | undefined;
}

/** Data-quality findings of an OCEL (or event log): one card per finding, passed checks last. With
 *  `onRepair`, each finding offers its fixes, and the picked ones are handed over as repairs.
 *  `num_objects` counts what `unit` names, e.g., cases for an event log. */
export function OcelHealthView({
  data,
  subject = "OCEL",
  unit = "objects",
  totalOf,
  onRepair,
}: OcelHealthViewProps) {
  // Unset means the recommended fixes, so they start out selected.
  const [stored, setChosen] = useViewSetting<ChosenFixes | null>("health.fixes", null);
  const [passedOpen, setPassedOpen] = useState(false);
  const failed = data.findings.filter((f) => f.count > 0);
  const chosen = stored ?? recommendedFixes(failed);
  const passed = data.findings.filter((f) => f.count === 0);
  const warnings = failed.filter((f) => f.severity === "warning").length;
  const items = data.num_events + data.num_objects;
  const fixable = !!onRepair && failed.some((f) => f.fixes.length > 0);
  const unitLabel = unit ? unit[0].toUpperCase() + unit.slice(1) : "Items";

  return (
    <Flex direction="column" style={{ height: "100%", minHeight: 0 }}>
      <Toolbar
        end={
          <Text size="1" color="gray">
            {data.findings.length} checks over {fmtInt(data.num_events)} events and {fmtInt(data.num_objects)}{" "}
            {unit}
          </Text>
        }
      />

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16 }}>
        <Flex direction="column" gap="5" style={{ maxWidth: 1040 }}>
          <MetricRow>
            <Metric label="Events" value={fmtInt(data.num_events)} />
            <Metric label={unitLabel} value={fmtInt(data.num_objects)} />
            <Metric
              label="Findings"
              value={failed.length === 0 ? "None" : fmtInt(failed.length)}
              hint={
                failed.length === 0
                  ? `${data.findings.length} checks found nothing`
                  : [
                      warnings > 0 && `${warnings} warning${warnings === 1 ? "" : "s"}`,
                      failed.length > warnings &&
                        `${failed.length - warnings} note${failed.length - warnings === 1 ? "" : "s"}`,
                    ]
                      .filter(Boolean)
                      .join(", ")
              }
            />
          </MetricRow>

          {failed.length > 0 && (
            <Section
              title="Findings"
              subtitle={`Each finding lists examples of affected ${subject === "OCEL" ? "events, objects or types" : "cases or attributes"}.`}
            >
              <Flex direction="column" gap="3">
                {fixable && onRepair && (
                  <FixBar findings={failed} chosen={chosen} setChosen={setChosen} onRepair={onRepair} />
                )}
                {failed.map((f) => (
                  <FindingCard
                    key={f.check}
                    f={f}
                    {...(totalOf?.(f) ?? { total: items, noun: "items" })}
                    fix={
                      onRepair && f.fixes.length > 0 ? (
                        <FixPicker
                          f={f}
                          value={chosen[f.check] ?? LEAVE}
                          onChange={(fix) => {
                            const { [f.check]: _, ...rest } = chosen;
                            setChosen(fix === LEAVE ? rest : { ...rest, [f.check]: fix });
                          }}
                        />
                      ) : undefined
                    }
                  />
                ))}
              </Flex>
            </Section>
          )}

          {passed.length > 0 && (
            <Section>
              <button
                type="button"
                aria-expanded={passedOpen}
                onClick={() => setPassedOpen((o) => !o)}
                style={{
                  all: "unset",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                }}
              >
                <PiCaretRight
                  style={{
                    transform: passedOpen ? "rotate(90deg)" : undefined,
                    transition: "transform 150ms",
                  }}
                />
                <span className="r4pm-eyebrow">Checks that found nothing ({passed.length})</span>
              </button>
              {passedOpen && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                    gap: 8,
                  }}
                >
                  {passed.map((f) => (
                    <Flex
                      key={f.check}
                      gap="2"
                      p="3"
                      style={{
                        borderRadius: 10,
                        background: "var(--gray-a2)",
                        border: "1px solid var(--gray-a3)",
                      }}
                    >
                      <Text color="gray" style={{ display: "flex", paddingTop: 2 }}>
                        <PiCheckCircle />
                      </Text>
                      <Flex direction="column" gap="1">
                        <Text size="2" weight="medium">
                          {f.title}
                        </Text>
                        <Text size="1" color="gray">
                          {f.description}
                        </Text>
                      </Flex>
                    </Flex>
                  ))}
                </div>
              )}
            </Section>
          )}
        </Flex>
      </div>
    </Flex>
  );
}
