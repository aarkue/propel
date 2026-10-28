import { type PagedList, SearchSelect, SegmentedControl, Select, Text } from "@r4pm/components/ui";
import { ActivityChip } from "../shared/ActivitySequence";
import { useColorOf } from "../viewer/viewer-config";
import type {
  CaseSort,
  CaseTimeCurve,
  StepTimeStats,
  VariantSort,
  VariantSummary,
} from "./variant-time-profile-data";

const COLOR_VARIANT = "#3E63DD";
const COLOR_CASE = "#EF5F00";

const lastOf = (xs: number[]) => xs[xs.length - 1] ?? 0;
const getVariantKey = (v: VariantSummary) => String(v.rank);
const getCaseKey = (c: CaseTimeCurve) => c.case_id;

function VariantRow({
  variant,
  share,
  fmt,
}: {
  variant: VariantSummary;
  share: number;
  fmt: (ms: number) => string;
}) {
  const colorOf = useColorOf("activity");
  const hit = variant.matched.length > 0 ? new Set(variant.matched) : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <Text size="1" color="gray" style={{ minWidth: 26, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
        #{(variant.rank + 1).toLocaleString("en")}
      </Text>
      <div style={{ width: 52, flexShrink: 0 }} title={`${variant.num_cases.toLocaleString("en")} cases`}>
        <Text size="1" weight="medium" style={{ fontVariantNumeric: "tabular-nums" }}>
          {share >= 0.001 || share === 0 ? `${(share * 100).toFixed(1)}%` : "<0.1%"}
        </Text>
        <div style={{ height: 4, borderRadius: 2, background: "var(--gray-a4)", overflow: "hidden" }}>
          <div style={{ width: `${Math.max(2, share * 100)}%`, height: "100%", background: COLOR_VARIANT }} />
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          maskImage: "linear-gradient(to right, black calc(100% - 24px), transparent)",
        }}
      >
        {variant.activities.map((a, i) => (
          <ActivityChip
            key={`${i}-${a}`}
            activity={a}
            color={colorOf(a)}
            widthClass="max-w-[7rem]"
            className={hit && !hit.has(i) ? "shrink-0 opacity-35" : "shrink-0"}
          />
        ))}
      </div>
      <Text size="1" color="gray" style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
        {variant.activities.length} steps, {fmt(variant.median_total_ms)}
      </Text>
    </div>
  );
}

const VARIANT_SORT_LABEL: Record<VariantSort, string> = {
  Frequency: "Most frequent",
  SlowestFirst: "Slowest",
  FastestFirst: "Fastest",
  LongestFirst: "Longest",
  ShortestFirst: "Shortest",
};

export function VariantPicker({
  list,
  selected,
  onSelect,
  sort,
  onSortChange,
  totalCases,
  numVariants,
  fmt,
  onStep,
  canStep,
}: {
  list: PagedList<VariantSummary>;
  selected: VariantSummary | null;
  onSelect: (v: VariantSummary) => void;
  sort: VariantSort;
  onSortChange: (sort: VariantSort) => void;
  totalCases: number;
  numVariants: number;
  fmt: (ms: number) => string;
  onStep: (delta: -1 | 1) => void;
  canStep: { prev: boolean; next: boolean };
}) {
  const share = (v: VariantSummary) => v.num_cases / Math.max(1, totalCases);
  return (
    <SearchSelect<VariantSummary>
      aria-label="Variant"
      list={list}
      getKey={getVariantKey}
      value={selected ? getVariantKey(selected) : null}
      selectedItem={selected}
      onChange={(_, v) => v && onSelect(v)}
      searchPlaceholder="Activities in order, e.g. 'create send pay', or #rank"
      renderItem={(v) => <VariantRow variant={v} share={share(v)} fmt={fmt} />}
      renderValue={(v) => v && <VariantRow variant={{ ...v, matched: [] }} share={share(v)} fmt={fmt} />}
      placeholder="Loading variants..."
      rowHeight={40}
      popoverWidth="min(760px, 90vw)"
      stepper
      onStep={onStep}
      canStep={canStep}
      header={
        <Select.Root size="1" value={sort} onValueChange={(v) => onSortChange(v as VariantSort)}>
          <Select.Trigger variant="soft" />
          <Select.Content>
            {(Object.keys(VARIANT_SORT_LABEL) as VariantSort[]).map((s) => (
              <Select.Item key={s} value={s}>
                {VARIANT_SORT_LABEL[s]} first
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      }
      footer={
        <Text size="1" color="gray">
          {list.total === null
            ? "Loading..."
            : list.query.trim()
              ? `${list.total.toLocaleString("en")} of ${numVariants.toLocaleString("en")} variants match.`
              : `${numVariants.toLocaleString("en")} variants.`}{" "}
          Time is the median from case start to the last step.
        </Text>
      }
      style={{ flex: 1, minWidth: 0 }}
    />
  );
}

/** Tiny chart of one case against its variant's 10-90% band and median. */
function CaseSparkline({ steps, curve }: { steps: StepTimeStats[]; curve: number[] }) {
  const W = 110;
  const H = 26;
  const n = steps.length;
  const maxY = Math.max(1, lastOf(steps.map((s) => s.p90_ms)), ...curve);
  const px = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * (W - 4) + 2);
  const py = (ms: number) => H - 2 - (ms / maxY) * (H - 4);
  const line = (ys: number[]) => ys.map((y, i) => `${px(i)},${py(y)}`).join(" ");
  const band = [
    ...steps.map((s, i) => `${px(i)},${py(s.p90_ms)}`),
    ...steps.map((s, i) => `${px(i)},${py(s.p10_ms)}`).reverse(),
  ].join(" ");
  return (
    <svg
      width={W}
      height={H}
      role="img"
      aria-label="Case timing vs. variant median"
      style={{ flexShrink: 0 }}
    >
      <polygon points={band} fill="rgba(62, 99, 221, 0.22)" />
      <polyline
        points={line(steps.map((s) => s.median_ms))}
        fill="none"
        stroke={COLOR_VARIANT}
        strokeWidth={1.5}
      />
      <polyline points={line(curve)} fill="none" stroke={COLOR_CASE} strokeWidth={2} />
    </svg>
  );
}

function CaseRow({
  curve,
  steps,
  fmt,
}: {
  curve: CaseTimeCurve;
  steps: StepTimeStats[];
  fmt: (ms: number) => string;
}) {
  const total = lastOf(curve.elapsed_ms);
  const median = lastOf(steps.map((s) => s.median_ms));
  const ratio = median > 0 ? total / median : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <Text
        size="2"
        weight="medium"
        truncate
        title={curve.case_id}
        style={{ flex: 1, minWidth: 0, fontFamily: "var(--code-font-family)" }}
      >
        {curve.case_id}
      </Text>
      <CaseSparkline steps={steps} curve={curve.elapsed_ms} />
      <Text
        size="1"
        style={{ width: 64, flexShrink: 0, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
      >
        {fmt(total)}
      </Text>
      <Text
        size="1"
        color="gray"
        title="Total time relative to the variant's median"
        style={{ width: 44, flexShrink: 0, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
      >
        {ratio == null ? "" : `${ratio.toFixed(ratio < 10 ? 2 : 0)}x`}
      </Text>
    </div>
  );
}

export function CasePicker({
  list,
  steps,
  numCases,
  selected,
  onSelect,
  sort,
  onSortChange,
  fmt,
  onStep,
  canStep,
}: {
  list: PagedList<CaseTimeCurve>;
  steps: StepTimeStats[];
  numCases: number;
  selected: CaseTimeCurve | null;
  /** `index` is the case's position in the current list order (-1 for no overlay). */
  onSelect: (c: CaseTimeCurve | null, index: number) => void;
  sort: CaseSort;
  onSortChange: (sort: CaseSort) => void;
  fmt: (ms: number) => string;
  onStep: (delta: -1 | 1) => void;
  canStep: { prev: boolean; next: boolean };
}) {
  return (
    <SearchSelect<CaseTimeCurve>
      aria-label="Case overlay"
      list={list}
      getKey={getCaseKey}
      value={selected?.case_id ?? null}
      selectedItem={selected}
      onChange={(_, c, index) => onSelect(c, index)}
      searchPlaceholder="Filter by case id"
      noneOption="No case overlay"
      renderItem={(c) => <CaseRow curve={c} steps={steps} fmt={fmt} />}
      renderValue={(c) =>
        c && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <Text size="2" truncate style={{ flex: 1, minWidth: 0, fontFamily: "var(--code-font-family)" }}>
              {c.case_id}
            </Text>
            <CaseSparkline steps={steps} curve={c.elapsed_ms} />
            <Text size="1" color="gray" style={{ flexShrink: 0 }}>
              {fmt(lastOf(c.elapsed_ms))}
            </Text>
          </div>
        )
      }
      rowHeight={36}
      popoverWidth="420px"
      stepper
      onStep={onStep}
      canStep={canStep}
      header={
        <SegmentedControl.Root size="1" value={sort} onValueChange={(v) => onSortChange(v as CaseSort)}>
          <SegmentedControl.Item value="LogOrder">Log order</SegmentedControl.Item>
          <SegmentedControl.Item value="FastestFirst">Fastest</SegmentedControl.Item>
          <SegmentedControl.Item value="SlowestFirst">Slowest</SegmentedControl.Item>
        </SegmentedControl.Root>
      }
      footer={
        <Text size="1" color="gray">
          {list.total === null
            ? "Loading..."
            : list.query.trim()
              ? `${list.total.toLocaleString("en")} of ${numCases.toLocaleString("en")} cases match.`
              : `${numCases.toLocaleString("en")} cases.`}{" "}
          Sparkline: case vs. the variant's median and 10-90% band; "x" is its total time vs. the median.
        </Text>
      }
      style={{ width: 380 }}
    />
  );
}
