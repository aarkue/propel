import { Button, Flex, Progress, Text } from "@r4pm/components/ui";

/**
 * How far a long call got: `done` of `total` units in `stage`, without `total` when unknown. The same
 * shape as `JobProgress` of `@r4pm/client`, so the client's reports pass in as they are.
 */
export interface JobProgressReport {
  stage: string;
  done: number;
  total?: number | null;
}

/** How to show the counts of one stage. */
export interface ProgressUnit {
  /** What the stage counts, after the numbers, e.g., "variants" or "MB". */
  noun?: string;
  /** Formats `done` and `total`; default with thousands separators. */
  format?: (n: number) => string;
  /** Shown instead of the stage name. */
  title?: string;
  /** The total is a limit the work rarely reaches, so a share of it says little: show the count only. */
  totalIsLimit?: boolean;
}

/** Units by stage name. A stage `<prefix>: <name>` uses the unit of `<name>`. */
export type ProgressUnits = Record<string, ProgressUnit>;

export interface DescribedProgress {
  title: string;
  /** e.g. "1,204 of 2,560 variants", or "1,204 steps" without a total. */
  detail: string;
  /** 0..1, or null when the total is unknown. */
  fraction: number | null;
}

const count = (n: number) => n.toLocaleString("en");

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Title, counts and share of a progress report; without a unit for its stage, plain counts. */
export function describeProgress(p: JobProgressReport, units?: ProgressUnits): DescribedProgress {
  const colon = p.stage.lastIndexOf(": ");
  const prefix = colon > 0 ? p.stage.slice(0, colon) : null;
  const base = colon > 0 ? p.stage.slice(colon + 2) : p.stage;
  const unit = units?.[base];
  const total = unit?.totalIsLimit ? null : (p.total ?? null);
  const fraction = total ? Math.min(1, p.done / total) : null;
  const fmt = unit?.format ?? count;
  const numbers = total ? `${fmt(p.done)} of ${fmt(total)}` : fmt(p.done);
  return {
    title:
      unit?.title ??
      (prefix ? `${prefix}: ${base.charAt(0).toLowerCase()}${base.slice(1)}` : capitalize(base)),
    detail: unit?.noun ? `${numbers} ${unit.noun}` : numbers,
    fraction,
  };
}

const percent = (f: number) => `${Math.floor(f * 100)}%`;

export interface JobProgressCardProps {
  progress: JobProgressReport | null;
  /** Absent when the backend cannot cancel (the in-browser engine). */
  onCancel?: () => void;
  /** Shown until the first report. */
  label?: string;
  units?: ProgressUnits;
}

/** Progress of a call that has nothing to show yet: stage, bar, counts and Cancel, centered. */
export function JobProgressCard({ progress, onCancel, label = "Starting...", units }: JobProgressCardProps) {
  const d = progress ? describeProgress(progress, units) : null;
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      gap="3"
      className="w-full h-full min-h-[8rem] p-6"
      role="status"
      aria-live="polite"
    >
      <Flex direction="column" gap="2" style={{ width: "min(22rem, 100%)" }}>
        <Flex justify="between" align="baseline" gap="3">
          <Text size="2" weight="medium" truncate>
            {d?.title ?? label}
          </Text>
          {d?.fraction != null && (
            <Text size="2" color="gray" className="tabular-nums">
              {percent(d.fraction)}
            </Text>
          )}
        </Flex>
        <Progress
          size="2"
          value={d?.fraction != null ? d.fraction * 100 : undefined}
          duration={d?.fraction != null ? undefined : "2s"}
        />
        <Text size="1" color="gray" className="tabular-nums" style={{ minHeight: "1.2em" }}>
          {d?.detail ?? ""}
        </Text>
      </Flex>
      {onCancel && (
        <Button size="2" variant="soft" color="gray" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </Flex>
  );
}

export interface JobProgressStripProps {
  progress: JobProgressReport | null;
  onCancel?: () => void;
  units?: ProgressUnits;
}

/** Progress above a view that already shows partial results. */
export function JobProgressStrip({ progress, onCancel, units }: JobProgressStripProps) {
  const d = progress ? describeProgress(progress, units) : null;
  return (
    <Flex
      align="center"
      gap="3"
      px="3"
      py="2"
      role="status"
      aria-live="polite"
      style={{ borderBottom: "1px solid var(--gray-a5)", background: "var(--color-panel-solid)" }}
    >
      <Text size="1" weight="medium" truncate style={{ minWidth: 0, flexShrink: 1 }}>
        {d?.title ?? "Starting..."}
      </Text>
      <Progress
        size="1"
        value={d?.fraction != null ? d.fraction * 100 : undefined}
        duration={d?.fraction != null ? undefined : "2s"}
        style={{ flex: "1 1 6rem", minWidth: "4rem" }}
      />
      <Text size="1" color="gray" className="tabular-nums" style={{ whiteSpace: "nowrap" }}>
        {d ? (d.fraction != null ? `${percent(d.fraction)}, ${d.detail}` : d.detail) : ""}
      </Text>
      {onCancel && (
        <Button size="1" variant="soft" color="gray" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </Flex>
  );
}

export interface PartialResultStripProps {
  onRun?: () => void;
  what?: string;
}

/** A note above partial results kept after Cancel. */
export function PartialResultStrip({ onRun, what = "results" }: PartialResultStripProps) {
  return (
    <Flex
      align="center"
      gap="3"
      px="3"
      py="2"
      style={{ borderBottom: "1px solid var(--amber-a5)", background: "var(--amber-a2)" }}
    >
      <Text size="1" weight="medium" color="amber">
        Cancelled
      </Text>
      <Text size="1" color="gray" style={{ flex: 1, minWidth: 0 }} truncate>
        Showing the {what} found before cancelling.
      </Text>
      {onRun && (
        <Button size="1" variant="soft" onClick={onRun}>
          Run again
        </Button>
      )}
    </Flex>
  );
}
