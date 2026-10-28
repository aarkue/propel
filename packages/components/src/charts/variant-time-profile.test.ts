import { describe, expect, it } from "vitest";
import { inMemoryVariantTiming, matchVariant, pickTimeUnit } from "./variant-time-profile-data";

describe("pickTimeUnit", () => {
  it("uses the largest unit the maximum spans at least twice", () => {
    expect(pickTimeUnit(3 * 86_400_000).label).toBe("days");
    expect(pickTimeUnit(86_400_000).label).toBe("hours");
    expect(pickTimeUnit(90_000).label).toBe("seconds");
    expect(pickTimeUnit(500).label).toBe("ms");
  });
});

describe("matchVariant", () => {
  const v6 = ["Create Fine", "Send Fine", "Insert Fine Notification", "Payment", "Add penalty", "Payment"];
  const v4 = ["Create Fine", "Send Fine", "Insert Fine Notification", "Add penalty", "Payment"];

  it("matches tokens in activity order, several tokens per activity", () => {
    expect(matchVariant(v6, "create send paym add penalty pay")?.matched).toEqual([0, 1, 3, 4, 5]);
  });

  it("rejects variants with the activities in a different order", () => {
    expect(matchVariant(v4, "create send paym add penalty pay")).toBeNull();
    expect(matchVariant(["Payment", "Create Fine"], "create pay")).toBeNull();
  });

  it("prefers variants the query covers more completely", () => {
    const short = matchVariant(["Create Fine", "Payment"], "create pay")!;
    const long = matchVariant(v6, "create pay")!;
    expect(short.score).toBeGreaterThan(long.score);
  });

  it("prefers word-start hits over mid-word hits", () => {
    const start = matchVariant(["Send Fine"], "fine")!;
    const mid = matchVariant(["Refined"], "fine")!;
    expect(start.score).toBeGreaterThan(mid.score);
  });
});

describe("inMemoryVariantTiming", () => {
  const step = (ms: number) => ({
    min_ms: ms,
    p10_ms: ms,
    p25_ms: ms,
    median_ms: ms,
    p75_ms: ms,
    p90_ms: ms,
    max_ms: ms,
    mean_ms: ms,
  });
  const { loadVariants, loadProfile } = inMemoryVariantTiming([
    {
      activities: ["a", "b"],
      num_cases: 3,
      steps: [step(0), step(30)],
      cases: [
        { case_id: "c1", elapsed_ms: [0, 10] },
        { case_id: "c2", elapsed_ms: [0, 50] },
        { case_id: "c10", elapsed_ms: [0, 30] },
      ],
    },
    { activities: ["a"], num_cases: 1, steps: [step(0)], cases: [{ case_id: "c3", elapsed_ms: [0] }] },
  ]);
  const req = {
    activities: ["a", "b"],
    variant_sort: "Frequency" as const,
    case_query: "",
    case_sort: "SlowestFirst" as const,
    case_offset: 0,
    case_limit: 10,
    focus_case: null,
  };

  it("pages variants in the requested sort", async () => {
    const p = await loadVariants({ query: "", sort: "ShortestFirst", offset: 0, limit: 1 });
    expect(p.total).toBe(2);
    expect(p.rows[0].activities).toEqual(["a"]);
  });

  it("finds a case by exact id with its position in the case order", async () => {
    const p = await loadProfile({ ...req, focus_case: "c1" });
    expect(p?.cases.map((c) => c.case_id)).toEqual(["c1"]);
    expect(p?.focus_index).toBe(2);
  });

  it("reports the variant's position in the requested variant sort", async () => {
    expect((await loadProfile(req))?.sort_position).toBe(0);
    expect((await loadProfile({ ...req, variant_sort: "ShortestFirst" }))?.sort_position).toBe(1);
  });
});
