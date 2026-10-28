// Local view-models mirroring the generated `app_bindings::variant_timing` bindings.
export interface StepTimeStats {
  min_ms: number;
  p10_ms: number;
  p25_ms: number;
  median_ms: number;
  p75_ms: number;
  p90_ms: number;
  max_ms: number;
  mean_ms: number;
}

export interface CaseTimeCurve {
  case_id: string;
  elapsed_ms: number[];
}

export interface VariantSummary {
  /** 0-based position by frequency. */
  rank: number;
  activities: string[];
  num_cases: number;
  /** Median time from case start to the last step. */
  median_total_ms: number;
  /** Activity indices the query matched. */
  matched: number[];
}

export interface VariantTimingPage {
  /** Variants matching the query. */
  total: number;
  num_variants: number;
  num_timed_cases: number;
  num_untimed_cases: number;
  rows: VariantSummary[];
}

export type VariantSort = "Frequency" | "SlowestFirst" | "FastestFirst" | "LongestFirst" | "ShortestFirst";
export type CaseSort = "LogOrder" | "FastestFirst" | "SlowestFirst";

/** One variant's timing over all its cases, plus one page of those cases. */
export interface VariantTimeProfile {
  rank: number;
  /** Position in `variant_sort` order. */
  sort_position: number;
  activities: string[];
  num_cases: number;
  /** One entry per step, aligned with `activities`: elapsed time since case start. */
  steps: StepTimeStats[];
  /** Cases matching the case query. */
  cases_total: number;
  cases: CaseTimeCurve[];
  /** Position of `focus_case` in `case_sort` order. */
  focus_index?: number | null;
}

export interface VariantPageRequest {
  /** Activities in order (ordered fuzzy match, see {@link matchVariant}) or `#<rank>`. */
  query: string;
  sort: VariantSort;
  offset: number;
  limit: number;
}

export interface VariantProfileRequest {
  activities: string[];
  /** The sort `sort_position` refers to. */
  variant_sort: VariantSort;
  /** Tokens matched against the case id. */
  case_query: string;
  case_sort: CaseSort;
  case_offset: number;
  case_limit: number;
  /** An exact case id: the page is just that case, and `focus_index` is its position. */
  focus_case: string | null;
}

/** Argument shapes match the engine bindings. */
export interface VariantTimingLoaders {
  loadVariants: (req: VariantPageRequest) => Promise<VariantTimingPage>;
  loadProfile: (req: VariantProfileRequest) => Promise<VariantTimeProfile | null>;
}

const TIME_UNITS: { label: string; ms: number }[] = [
  { label: "days", ms: 86_400_000 },
  { label: "hours", ms: 3_600_000 },
  { label: "minutes", ms: 60_000 },
  { label: "seconds", ms: 1_000 },
];

/** Largest unit in which `maxMs` is at least 2, so the axis reads in whole-ish numbers. */
export function pickTimeUnit(maxMs: number): { label: string; ms: number } {
  return TIME_UNITS.find((u) => maxMs >= 2 * u.ms) ?? { label: "ms", ms: 1 };
}

export interface VariantMatch {
  /** Higher is better. */
  score: number;
  /** Indices of the activities the query tokens landed on, ascending. */
  matched: number[];
}

const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

/**
 * Ordered fuzzy match of `query` against a variant: every whitespace-separated token must occur
 * (case-insensitive substring) in an activity at or after the previous token's position, so
 * "create send pay" finds Create Fine > Send Fine > ... > Payment but not Payment > Create Fine.
 * Consecutive tokens may hit the same activity ("add penalty"), and activities may be skipped.
 * Greedy earliest matching is exact here: taking the earliest position never blocks a later token.
 * Scores favor covering more of the variant, tokens at word starts, and fewer skipped activities.
 * Mirrors `match_variant` in the engine's `variant_timing.rs`.
 */
export function matchVariant(activities: string[], query: string): VariantMatch | null {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { score: 0, matched: [] };
  const names = activities.map((a) => a.toLowerCase());
  const matched: number[] = [];
  let ai = 0;
  let offset = 0;
  let wordStarts = 0;
  for (const token of tokens) {
    let found = false;
    for (; ai < names.length; ai++, offset = 0) {
      const at = names[ai].indexOf(token, offset);
      if (at < 0) continue;
      if (matched[matched.length - 1] !== ai) matched.push(ai);
      if (!isWordChar(names[ai][at - 1])) wordStarts++;
      offset = at + token.length;
      found = true;
      break;
    }
    if (!found) return null;
  }
  const span = matched[matched.length - 1] - matched[0] + 1;
  const skipped = span - matched.length;
  const coverage = matched.length / names.length;
  return { score: 2 * coverage + 0.5 * (wordStarts / tokens.length) - 0.05 * skipped, matched };
}

export interface InMemoryVariant {
  activities: string[];
  num_cases: number;
  steps: StepTimeStats[];
  /** The cases to list and overlay (may be a sample). */
  cases: CaseTimeCurve[];
}

const RANK_QUERY = /^#(\d+)$/;
const lastOf = (xs: number[]) => xs[xs.length - 1] ?? 0;

/** {@link VariantTimingLoaders} over data already in memory, with the engine's search, sort and
 *  paging semantics. For stories, tests and hosts without an engine. */
export function inMemoryVariantTiming(
  variants: InMemoryVariant[],
  counts: { num_untimed_cases?: number } = {},
): VariantTimingLoaders {
  const ranked = [...variants].sort((a, b) => b.num_cases - a.num_cases);
  const medianTotal = (v: InMemoryVariant) => lastOf(v.steps.map((s) => s.median_ms));
  const sortKey: Record<VariantSort, (v: InMemoryVariant) => number> = {
    Frequency: () => 0,
    SlowestFirst: (v) => -medianTotal(v),
    FastestFirst: medianTotal,
    LongestFirst: (v) => -v.activities.length,
    ShortestFirst: (v) => v.activities.length,
  };
  const numTimed = ranked.reduce((n, v) => n + v.num_cases, 0);
  return {
    loadVariants: async ({ query, sort, offset, limit }) => {
      const q = query.trim();
      const rankHit = RANK_QUERY.exec(q);
      const hits = ranked
        .map((v, rank) => {
          if (rankHit) return Number(rankHit[1]) === rank + 1 ? { v, rank, score: 0, matched: [] } : null;
          const m = matchVariant(v.activities, q);
          return m && { v, rank, ...m };
        })
        .filter((h) => h !== null)
        .sort((a, b) => b.score - a.score || sortKey[sort](a.v) - sortKey[sort](b.v) || a.rank - b.rank);
      return {
        total: hits.length,
        num_variants: ranked.length,
        num_timed_cases: numTimed,
        num_untimed_cases: counts.num_untimed_cases ?? 0,
        rows: hits.slice(offset, offset + limit).map(({ v, rank, matched }) => ({
          rank,
          activities: v.activities,
          num_cases: v.num_cases,
          median_total_ms: medianTotal(v),
          matched,
        })),
      };
    },
    loadProfile: async ({
      activities,
      variant_sort,
      case_query,
      case_sort,
      case_offset,
      case_limit,
      focus_case,
    }) => {
      const rank = ranked.findIndex(
        (v) => v.activities.length === activities.length && v.activities.every((a, i) => a === activities[i]),
      );
      if (rank < 0) return null;
      const v = ranked[rank];
      const bySort = ranked
        .map((x, r) => ({ x, r }))
        .sort((a, b) => sortKey[variant_sort](a.x) - sortKey[variant_sort](b.x) || a.r - b.r);
      let ordered = v.cases;
      if (case_sort !== "LogOrder") {
        const dir = case_sort === "FastestFirst" ? 1 : -1;
        ordered = [...ordered].sort((a, b) => dir * (lastOf(a.elapsed_ms) - lastOf(b.elapsed_ms)));
      }
      const base = {
        rank,
        sort_position: bySort.findIndex((e) => e.r === rank),
        activities: v.activities,
        num_cases: v.num_cases,
        steps: v.steps,
      };
      if (focus_case !== null) {
        const at = ordered.findIndex((c) => c.case_id === focus_case);
        return at < 0
          ? { ...base, cases_total: 0, cases: [], focus_index: null }
          : { ...base, cases_total: 1, cases: [ordered[at]], focus_index: at };
      }
      const cases = ordered.filter((c) => matchesTokens(c.case_id, case_query));
      return {
        ...base,
        cases_total: cases.length,
        cases: cases.slice(case_offset, case_offset + case_limit),
        focus_index: null,
      };
    },
  };
}

function matchesTokens(text: string, query: string): boolean {
  const hay = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}
