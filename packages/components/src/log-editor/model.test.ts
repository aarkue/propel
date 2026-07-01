import { describe, expect, it } from "vitest";
import {
  addCaseAttrColumn,
  appendEvents,
  applyQuickAdd,
  DEFAULT_TIME,
  duplicateCase,
  EMPTY_LOG,
  fromLogJson,
  getCaseMeta,
  parseQuickAdd,
  reflowTimes,
  reorderWithinCase,
  rowsByCase,
  setCaseAttr,
  setCaseCount,
  toLogJson,
  type EventLogModel,
} from "./model";

const startMs = Date.parse(DEFAULT_TIME.start);
const stepMs = DEFAULT_TIME.stepSeconds * 1000;

describe("parseQuickAdd", () => {
  it("parses a cased trace", () => {
    expect(parseQuickAdd("c1 > Register Check Approve")).toEqual({
      kind: "append",
      caseIds: ["c1"],
      activities: ["Register", "Check", "Approve"],
    });
  });

  it("auto-allocates when no case given", () => {
    expect(parseQuickAdd("Register Check")).toEqual({
      kind: "append",
      caseIds: [null],
      activities: ["Register", "Check"],
    });
  });

  it("expands a numeric case range", () => {
    expect(parseQuickAdd("c2..c4 > A B")).toEqual({
      kind: "append",
      caseIds: ["c2", "c3", "c4"],
      activities: ["A", "B"],
    });
  });

  it("parses dup", () => {
    expect(parseQuickAdd("dup c1")).toEqual({ kind: "dup", caseId: "c1" });
  });

  it("treats blank / activity-less input as noop", () => {
    expect(parseQuickAdd("   ")).toEqual({ kind: "noop" });
    expect(parseQuickAdd("c1 >")).toEqual({ kind: "noop" });
  });
});

describe("appendEvents + time", () => {
  it("auto-stamps from the case start, stepping by the configured step", () => {
    const m = appendEvents(EMPTY_LOG, "c1", ["A", "B", "C"]);
    const times = m.rows.map((r) => Date.parse(r.time));
    expect(times).toEqual([startMs, startMs + stepMs, startMs + 2 * stepMs]);
  });

  it("each case starts independently at the same base", () => {
    let m = appendEvents(EMPTY_LOG, "c1", ["A", "B"]);
    m = appendEvents(m, "c2", ["X"]);
    const c1 = m.rows.filter((r) => r.caseId === "c1").map((r) => Date.parse(r.time));
    const c2 = m.rows.filter((r) => r.caseId === "c2").map((r) => Date.parse(r.time));
    expect(c1).toEqual([startMs, startMs + stepMs]);
    expect(c2).toEqual([startMs]);
  });

  it("appends contiguously into an existing case", () => {
    let m = appendEvents(EMPTY_LOG, "c1", ["A"]);
    m = appendEvents(m, "c2", ["X"]);
    m = appendEvents(m, "c1", ["B"]);
    expect(rowsByCase(m).map((c) => c.caseId)).toEqual(["c1", "c2"]);
    expect(rowsByCase(m)[0].rows.map((r) => r.activity)).toEqual(["A", "B"]);
  });
});

describe("manual time override + reflow", () => {
  it("keeps a manual time and continues auto rows from it", () => {
    let m = appendEvents(EMPTY_LOG, "c1", ["A", "B", "C"]);
    const manual = "2026-06-01T12:00:00.000Z";
    m = {
      ...m,
      rows: m.rows.map((r, i) => (i === 0 ? { ...r, time: manual, timeManual: true } : r)),
    };
    m = reflowTimes(m);
    const times = m.rows.map((r) => r.time);
    expect(times[0]).toBe(manual);
    expect(Date.parse(times[1])).toBe(Date.parse(manual) + stepMs);
    expect(Date.parse(times[2])).toBe(Date.parse(manual) + 2 * stepMs);
  });
});

describe("reorderWithinCase", () => {
  it("reorders a case's events and re-stamps times in the new order", () => {
    let m = appendEvents(EMPTY_LOG, "c1", ["A", "B", "C"]);
    m = reorderWithinCase(m, "c1", 2, 0); // move C to the front
    const acts = rowsByCase(m)[0].rows.map((r) => r.activity);
    expect(acts).toEqual(["C", "A", "B"]);
    const times = rowsByCase(m)[0].rows.map((r) => Date.parse(r.time));
    expect(times).toEqual([startMs, startMs + stepMs, startMs + 2 * stepMs]);
  });

  it("leaves other cases untouched", () => {
    let m = appendEvents(EMPTY_LOG, "c1", ["A", "B"]);
    m = appendEvents(m, "c2", ["X", "Y"]);
    m = reorderWithinCase(m, "c1", 0, 1);
    expect(rowsByCase(m)[0].rows.map((r) => r.activity)).toEqual(["B", "A"]);
    expect(rowsByCase(m)[1].rows.map((r) => r.activity)).toEqual(["X", "Y"]);
  });
});

describe("duplicateCase", () => {
  it("clones activities into a fresh case id", () => {
    let m = appendEvents(EMPTY_LOG, "c1", ["A", "B"]);
    m = duplicateCase(m, "c1");
    const cases = rowsByCase(m);
    expect(cases).toHaveLength(2);
    expect(cases[1].rows.map((r) => r.activity)).toEqual(["A", "B"]);
    expect(cases[1].caseId).not.toBe("c1");
  });

  it("copies case attributes into the clone but resets its count to 1", () => {
    let m = appendEvents(EMPTY_LOG, "c1", ["A"]);
    m = addCaseAttrColumn(m, "region", "string");
    m = setCaseAttr(m, "c1", "region", "EU");
    m = setCaseCount(m, "c1", 3);
    m = duplicateCase(m, "c1");
    const cloneId = rowsByCase(m)[1].caseId;
    expect(getCaseMeta(m, cloneId).attrs).toEqual({ region: "EU" });
    expect(getCaseMeta(m, cloneId).count).toBe(1);
  });
});

describe("setCaseCount", () => {
  it("clamps to an integer >= 1", () => {
    let m = appendEvents(EMPTY_LOG, "c1", ["A"]);
    m = setCaseCount(m, "c1", 4.7);
    expect(getCaseMeta(m, "c1").count).toBe(4);
    m = setCaseCount(m, "c1", 0);
    expect(getCaseMeta(m, "c1").count).toBe(1);
  });
});

describe("toLogJson count expansion", () => {
  it("emits count identical traces named caseId-1..caseId-n, only at export", () => {
    let m = appendEvents(EMPTY_LOG, "c1", ["A", "B"]);
    m = appendEvents(m, "c2", ["X"]);
    m = setCaseCount(m, "c1", 3);
    // editor model is not duplicated
    expect(rowsByCase(m).map((c) => c.caseId)).toEqual(["c1", "c2"]);
    const json = toLogJson(m);
    expect(json.traces.map((t) => t.caseId)).toEqual(["c1-1", "c1-2", "c1-3", "c2"]);
    expect(json.traces[0].events.map((e) => e.activity)).toEqual(["A", "B"]);
    expect(json.traces[1].events.map((e) => e.activity)).toEqual(["A", "B"]);
  });

  it("count 1 keeps the bare case id", () => {
    const m = appendEvents(EMPTY_LOG, "c1", ["A"]);
    expect(toLogJson(m).traces.map((t) => t.caseId)).toEqual(["c1"]);
  });
});

describe("applyQuickAdd", () => {
  it("creates one trace per case in a range", () => {
    const m = applyQuickAdd(EMPTY_LOG, "c1..c3 > A B");
    expect(rowsByCase(m).map((c) => c.caseId)).toEqual(["c1", "c2", "c3"]);
    expect(m.rows).toHaveLength(6);
  });
});

describe("toLogJson / fromLogJson round-trip", () => {
  it("preserves cases, activities, times and typed attributes", () => {
    let m: EventLogModel = {
      ...EMPTY_LOG,
      attrColumns: [
        { name: "Cost", type: "int" },
        { name: "Resource", type: "string" },
      ],
    };
    m = appendEvents(m, "c1", ["Register", "Approve"]);
    m = {
      ...m,
      rows: m.rows.map((r) =>
        r.activity === "Approve" ? { ...r, attrs: { Cost: "250", Resource: "Ann" } } : r,
      ),
    };
    const json = toLogJson(m);
    expect(json.traces).toHaveLength(1);
    expect(json.traces[0].events[1].attributes).toEqual([
      { name: "Cost", type: "int", value: "250" },
      { name: "Resource", type: "string", value: "Ann" },
    ]);
    // empty attribute cells dropped
    expect(json.traces[0].events[0].attributes).toEqual([]);

    const back = fromLogJson(json);
    expect(rowsByCase(back).map((c) => c.caseId)).toEqual(["c1"]);
    expect(back.attrColumns).toEqual([
      { name: "Cost", type: "int" },
      { name: "Resource", type: "string" },
    ]);
    expect(back.rows[1].attrs).toEqual({ Cost: "250", Resource: "Ann" });
    expect(back.rows[0].timeManual).toBe(true);
  });

  it("round-trips case-level attributes and drops empty ones", () => {
    let m = appendEvents(EMPTY_LOG, "c1", ["A"]);
    m = addCaseAttrColumn(m, "region", "string");
    m = addCaseAttrColumn(m, "vip", "boolean");
    m = addCaseAttrColumn(m, "note", "string"); // defined but left empty -> dropped on export
    m = setCaseAttr(m, "c1", "region", "EU");
    m = setCaseAttr(m, "c1", "vip", "true");
    const json = toLogJson(m);
    expect(json.traces[0].attributes).toEqual([
      { name: "region", type: "string", value: "EU" },
      { name: "vip", type: "boolean", value: "true" },
    ]);
    const back = fromLogJson(json);
    expect(getCaseMeta(back, "c1").attrs).toEqual({ region: "EU", vip: "true" });
    // only columns that carried a value round-trip (empty "note" is not re-derived)
    expect(back.caseAttrColumns).toEqual([
      { name: "region", type: "string" },
      { name: "vip", type: "boolean" },
    ]);
    expect(getCaseMeta(back, "c1").count).toBe(1);
  });
});
