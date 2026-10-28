import { Checkbox, Text, usePagedList } from "@r4pm/components/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlotParams } from "react-plotly.js";
import { useViewSetting } from "../viewer/view-state";
import { ErrorState } from "../feedback/ErrorState";
import { LoadingState } from "../feedback/LoadingState";
import { useViewerConfig } from "../viewer/viewer-config";
import { ThemedPlot as Plot } from "./themed-plot";
import {
  type CaseSort,
  type CaseTimeCurve,
  pickTimeUnit,
  type StepTimeStats,
  type VariantPageRequest,
  type VariantSort,
  type VariantSummary,
  type VariantTimingLoaders,
  type VariantTimingPage,
} from "./variant-time-profile-data";
import { CasePicker, VariantPicker } from "./variant-time-profile-pickers";

// Radix indigo-9 for the variant's distribution, orange-10 for the overlaid case (validated pair).
const COLOR_VARIANT = "#3E63DD";
const COLOR_CASE = "#EF5F00";

function defaultFormat(ms: number): string {
  const u = pickTimeUnit(ms);
  return `${Math.round((ms / u.ms) * 10) / 10} ${u.label}`;
}

function shortLabel(s: string, max = 18): string {
  return s.length > max ? `${s.slice(0, max - 1)}...` : s;
}

/** Latest result of `run`, re-run when `deps` change. Keeps the previous data while loading and
 *  drops results of superseded runs. */
function useLatestAsync<T>(run: (() => Promise<T>) | null, deps: readonly unknown[]) {
  const [state, setState] = useState<{ data?: T; loading: boolean; error: unknown }>({
    loading: false,
    error: null,
  });
  const runRef = useRef(run);
  runRef.current = run;
  // `deps` is the caller's re-run key.
  useEffect(() => {
    const current = runRef.current;
    if (!current) return setState({ loading: false, error: null });
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    current().then(
      (data) => live && setState({ data, loading: false, error: null }),
      (error) => live && setState((s) => ({ ...s, loading: false, error })),
    );
    return () => {
      live = false;
    };
  }, [...deps]);
  return state;
}

const lastOf = (xs: number[]) => xs[xs.length - 1] ?? 0;
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === "string");
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const VARIANT_SORTS: readonly VariantSort[] = [
  "Frequency",
  "SlowestFirst",
  "FastestFirst",
  "LongestFirst",
  "ShortestFirst",
];
const CASE_SORTS: readonly CaseSort[] = ["LogOrder", "FastestFirst", "SlowestFirst"];

export type VariantTimeProfileChartProps = VariantTimingLoaders;

/** Schwanen-Küsters plot: per variant, the elapsed time since case start at each step, as median,
 *  mean and percentile bands, optionally with one case overlaid. For data already in memory, use
 *  `inMemoryVariantTiming` as the loaders. */
export function VariantTimeProfileChart({ loadVariants, loadProfile }: VariantTimeProfileChartProps) {
  const fmt = useViewerConfig({}).format?.duration ?? defaultFormat;
  // Stored settings may come from an older version of this chart, so each is checked before use.
  const [storedActivities, setActivities] = useViewSetting<unknown>("variant", null);
  const [storedVariantSort, setVariantSort] = useViewSetting<unknown>("variantSort", "Frequency");
  const [storedCaseId, setCaseId] = useViewSetting<unknown>("case", null);
  const [storedCaseSort, setCaseSort] = useViewSetting<unknown>("caseSort", "LogOrder");
  const activities = isStringArray(storedActivities) ? storedActivities : null;
  const variantSort = oneOf(storedVariantSort, VARIANT_SORTS, "Frequency");
  const caseId = typeof storedCaseId === "string" ? storedCaseId : null;
  const caseSort = oneOf(storedCaseSort, CASE_SORTS, "LogOrder");
  const [showBands, setShowBands] = useViewSetting("bands", true);
  const [showMean, setShowMean] = useViewSetting("mean", true);
  const [meta, setMeta] = useState<Omit<VariantTimingPage, "total" | "rows"> | null>(null);
  const [overlay, setOverlay] = useState<CaseTimeCurve | null>(null);
  // Position of `overlay` in `caseSort` order, for prev/next. -1 when unknown.
  const [caseIndex, setCaseIndex] = useState(-1);
  const actsKey = activities?.join("\u0000") ?? "";

  const fetchVariants = useCallback(
    async (req: VariantPageRequest) => {
      const page = await loadVariants(req);
      setMeta({
        num_variants: page.num_variants,
        num_timed_cases: page.num_timed_cases,
        num_untimed_cases: page.num_untimed_cases,
      });
      return page;
    },
    [loadVariants],
  );
  const variants = usePagedList<VariantSummary>({
    load: (r) => fetchVariants({ ...r, sort: variantSort }),
    deps: [fetchVariants, variantSort],
  });

  const selectVariant = (acts: string[]) => {
    setActivities(acts);
    setCaseId(null);
    setOverlay(null);
    setCaseIndex(-1);
  };

  const profileState = useLatestAsync(
    activities
      ? () =>
          loadProfile({
            activities,
            variant_sort: variantSort,
            case_query: "",
            case_sort: "LogOrder",
            case_offset: 0,
            case_limit: 0,
            focus_case: null,
          })
      : null,
    [loadProfile, actsKey, variantSort],
  );
  const profile = profileState.data?.activities.join("\u0000") === actsKey ? profileState.data : undefined;

  // Start on the most frequent variant, and fall back to it when the stored one is not in this log.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-check only when the inputs change
  useEffect(() => {
    if (activities && !(profileState.data === null && !profileState.loading)) return;
    let live = true;
    fetchVariants({ query: "", sort: "Frequency", offset: 0, limit: 1 }).then((p) => {
      if (live && p.rows[0]) selectVariant(p.rows[0].activities);
    });
    return () => {
      live = false;
    };
  }, [actsKey, profileState.data, profileState.loading, fetchVariants]);

  const cases = usePagedList<CaseTimeCurve>({
    load: async (r) => {
      if (!activities) return { total: 0, rows: [] };
      const p = await loadProfile({
        activities,
        variant_sort: "Frequency",
        case_query: r.query,
        case_sort: caseSort,
        case_offset: r.offset,
        case_limit: r.limit,
        focus_case: null,
      });
      return { total: p?.cases_total ?? 0, rows: p?.cases ?? [] };
    },
    deps: [loadProfile, actsKey, caseSort],
  });

  // Stored settings keep only the case id. Load its curve and position so prev/next continue from it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-check only when the inputs change
  useEffect(() => {
    if (!activities || !caseId) return;
    let live = true;
    loadProfile({
      activities,
      variant_sort: "Frequency",
      case_query: "",
      case_sort: caseSort,
      case_offset: 0,
      case_limit: 1,
      focus_case: caseId,
    }).then((p) => {
      if (!live) return;
      const hit = p?.cases[0];
      if (hit) {
        setOverlay(hit);
        setCaseIndex(p?.focus_index ?? -1);
      } else {
        setCaseId(null);
        setOverlay(null);
        setCaseIndex(-1);
      }
    });
    return () => {
      live = false;
    };
  }, [actsKey, caseId, caseSort, loadProfile]);

  const stepVariant = (delta: -1 | 1) => {
    if (!profile) return;
    fetchVariants({ query: "", sort: variantSort, offset: profile.sort_position + delta, limit: 1 }).then(
      (p) => p.rows[0] && selectVariant(p.rows[0].activities),
    );
  };
  const stepCase = (delta: -1 | 1) => {
    if (!activities) return;
    const index = caseIndex < 0 ? 0 : caseIndex + delta;
    loadProfile({
      activities,
      variant_sort: "Frequency",
      case_query: "",
      case_sort: caseSort,
      case_offset: index,
      case_limit: 1,
      focus_case: null,
    }).then((p) => {
      const c = p?.cases[0];
      if (!c) return;
      setOverlay(c);
      setCaseId(c.case_id);
      setCaseIndex(index);
    });
  };

  const plot = useMemo(() => {
    if (!profile || profile.steps.length === 0) return null;
    const variant = profile;
    const x = variant.steps.map((_, i) => i);
    // The scale depends on the variant alone, so toggling bands or picking a case never rescales it.
    // A case above the 10-90% band is clipped to the top edge and marked there.
    const topMs = Math.max(1, ...variant.steps.map((s) => Math.max(s.p90_ms, s.mean_ms))) * 1.08;
    const unit = pickTimeUnit(topMs);
    const y = (ms: number) => ms / unit.ms;
    const pick = (k: keyof StepTimeStats) => variant.steps.map((s) => y(s[k]));
    const hover = variant.steps.map(
      (s, i) =>
        `<b>${i + 1}. ${variant.activities[i]}</b><br>median ${fmt(s.median_ms)}<br>mean ${fmt(s.mean_ms)}` +
        `<br>25-75%: ${fmt(s.p25_ms)} - ${fmt(s.p75_ms)}<br>10-90%: ${fmt(s.p10_ms)} - ${fmt(s.p90_ms)}`,
    );
    const band = (lo: keyof StepTimeStats, hi: keyof StepTimeStats, name: string, alpha: number) => [
      {
        type: "scatter" as const,
        mode: "lines" as const,
        x,
        y: pick(lo),
        line: { width: 0 },
        hoverinfo: "skip" as const,
        showlegend: false,
        legendgroup: name,
      },
      {
        type: "scatter" as const,
        mode: "lines" as const,
        x,
        y: pick(hi),
        line: { width: 0 },
        fill: "tonexty" as const,
        fillcolor: `rgba(62, 99, 221, ${alpha})`,
        hoverinfo: "skip" as const,
        name,
        legendgroup: name,
      },
    ];
    const traces: PlotParams["data"] = [
      ...(showBands
        ? [...band("p10_ms", "p90_ms", "10-90%", 0.12), ...band("p25_ms", "p75_ms", "25-75%", 0.22)]
        : []),
      {
        type: "scatter",
        mode: "lines+markers",
        x,
        y: pick("median_ms"),
        name: "Median",
        line: { color: COLOR_VARIANT, width: 2 },
        marker: { color: COLOR_VARIANT, size: 8 },
        text: hover,
        hovertemplate: "%{text}<extra></extra>",
      },
      ...(showMean
        ? [
            {
              type: "scatter" as const,
              mode: "lines" as const,
              x,
              y: pick("mean_ms"),
              name: "Mean",
              line: { color: COLOR_VARIANT, width: 2, dash: "dash" as const },
              hoverinfo: "skip" as const,
            },
          ]
        : []),
      ...(overlay
        ? [
            {
              type: "scatter" as const,
              mode: "lines+markers" as const,
              x,
              y: overlay.elapsed_ms.map((ms) => y(Math.min(ms, topMs))),
              name: `Case ${overlay.case_id}`,
              line: { color: COLOR_CASE, width: 2 },
              marker: {
                color: COLOR_CASE,
                size: overlay.elapsed_ms.map((ms) => (ms > topMs ? 12 : 8)),
                symbol: overlay.elapsed_ms.map((ms) => (ms > topMs ? "triangle-up" : "circle")),
              },
              cliponaxis: false,
              text: overlay.elapsed_ms.map((ms) => fmt(ms)),
              hovertemplate: `case ${overlay.case_id}: %{text}<extra></extra>`,
            },
          ]
        : []),
    ];
    const layout: PlotParams["layout"] = {
      autosize: true,
      margin: { t: 32, b: 96, l: 64, r: 16 },
      hovermode: "x unified",
      legend: { orientation: "h", y: 1.02, yanchor: "bottom", x: 0, font: { size: 11 } },
      xaxis: {
        tickvals: x,
        ticktext: variant.activities.map((a, i) => `${i + 1}. ${shortLabel(a)}`),
        tickangle: variant.activities.length > 6 ? -35 : 0,
        title: { text: "Step in variant" },
        automargin: true,
        zeroline: false,
      },
      yaxis: {
        title: { text: `Time since case start (${unit.label})` },
        range: [0, y(topMs)],
        automargin: true,
      },
    };
    return { traces, layout };
  }, [profile, overlay, showBands, showMean, fmt]);

  if (meta && meta.num_variants === 0) {
    return (
      <div style={{ padding: 16 }}>
        <Text size="2" color="gray">
          No cases with timestamps on every event.
          {meta.num_untimed_cases > 0 && ` (${meta.num_untimed_cases.toLocaleString("en")} cases skipped)`}
        </Text>
      </div>
    );
  }
  const error = profileState.error ?? variants.error;
  const selected: VariantSummary | null = profile
    ? {
        rank: profile.rank,
        activities: profile.activities,
        num_cases: profile.num_cases,
        median_total_ms: lastOf(profile.steps.map((s) => s.median_ms)),
        matched: [],
      }
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: 240 }}>
      <div
        data-export-ignore
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px 12px",
          flexWrap: "wrap",
          padding: "4px 8px",
        }}
      >
        <div style={{ display: "flex", width: "100%", minWidth: 0 }}>
          <VariantPicker
            list={variants}
            selected={selected}
            onSelect={(v) => selectVariant(v.activities)}
            sort={variantSort}
            onSortChange={setVariantSort}
            totalCases={meta?.num_timed_cases ?? 0}
            numVariants={meta?.num_variants ?? 0}
            fmt={fmt}
            onStep={stepVariant}
            canStep={{
              prev: !!profile && profile.sort_position > 0,
              next: !!profile && !!meta && profile.sort_position + 1 < meta.num_variants,
            }}
          />
        </div>
        <CasePicker
          list={cases}
          steps={profile?.steps ?? []}
          numCases={profile?.num_cases ?? 0}
          selected={overlay}
          onSelect={(c, index) => {
            setOverlay(c);
            setCaseId(c?.case_id ?? null);
            setCaseIndex(cases.query.trim() || !c ? -1 : index);
          }}
          sort={caseSort}
          onSortChange={(s) => {
            setCaseSort(s);
          }}
          fmt={fmt}
          onStep={stepCase}
          canStep={{
            prev: caseIndex > 0,
            next: !!profile && caseIndex + 1 < profile.num_cases,
          }}
        />
        <Text as="label" size="1" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Checkbox size="1" checked={showBands} onCheckedChange={(v) => setShowBands(v === true)} />
          Percentile bands
        </Text>
        <Text as="label" size="1" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Checkbox size="1" checked={showMean} onCheckedChange={(v) => setShowMean(v === true)} />
          Mean
        </Text>
        {meta && (
          <Text size="1" color="gray">
            {meta.num_variants.toLocaleString("en")} variants, {meta.num_timed_cases.toLocaleString("en")}{" "}
            cases
            {meta.num_untimed_cases > 0 &&
              `, ${meta.num_untimed_cases.toLocaleString("en")} without timestamps skipped`}
          </Text>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, position: "relative", opacity: profileState.loading ? 0.6 : 1 }}>
        {error ? (
          <ErrorState error={error} />
        ) : plot ? (
          <Plot
            data={plot.traces}
            layout={plot.layout}
            config={{ displaylogo: false, displayModeBar: false, responsive: true }}
            style={{ width: "100%", height: "100%" }}
            useResizeHandler
          />
        ) : (
          <LoadingState label="computing variant timing" slowAfterMs={8000} />
        )}
      </div>
    </div>
  );
}
