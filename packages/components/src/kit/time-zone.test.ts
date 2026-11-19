import { describe, expect, it } from "vitest";
import { offsetAt, zoneOffsets } from "./time-zone";

describe("zone offsets", () => {
  it("reads offsets with daylight saving time", () => {
    expect(offsetAt("Europe/Berlin", Date.UTC(2024, 0, 15))).toBe(60);
    expect(offsetAt("Europe/Berlin", Date.UTC(2024, 6, 15))).toBe(120);
    expect(offsetAt("Asia/Kolkata", Date.UTC(2024, 6, 15))).toBe(330);
    expect(offsetAt("America/New_York", Date.UTC(2024, 0, 15))).toBe(-300);
  });

  it("finds the 2024 changes of Berlin to the minute", () => {
    const changes = zoneOffsets("Europe/Berlin").filter(
      (c) => c.from_ms >= Date.UTC(2024, 0) && c.from_ms < Date.UTC(2025, 0),
    );
    expect(changes).toEqual([
      { from_ms: Date.UTC(2024, 2, 31, 1), offset_minutes: 120 },
      { from_ms: Date.UTC(2024, 9, 27, 1), offset_minutes: 60 },
    ]);
  });
});
