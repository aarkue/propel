import { describe, expect, it } from "vitest";
import { describeProgress, type ProgressUnits } from "./JobProgress";

const UNITS: ProgressUnits = {
  "Aligning variants": { noun: "variants" },
  "Searching schemas": { noun: "steps", totalIsLimit: true },
  Importing: { title: "Importing the file", noun: "MB", format: (n) => String(n / 1e6) },
};

describe("describeProgress", () => {
  it("shows plain counts without units", () => {
    expect(describeProgress({ stage: "Aligning variants", done: 1204, total: 2560 })).toEqual({
      title: "Aligning variants",
      detail: "1,204 of 2,560",
      fraction: 1204 / 2560,
    });
    expect(describeProgress({ stage: "mining", done: 12 })).toEqual({
      title: "Mining",
      detail: "12",
      fraction: null,
    });
  });

  it("names the units of a stage", () => {
    expect(describeProgress({ stage: "Aligning variants", done: 1204, total: 2560 }, UNITS).detail).toBe(
      "1,204 of 2,560 variants",
    );
    expect(
      describeProgress({ stage: "Searching schemas", done: 85_190, total: 250_000_000 }, UNITS),
    ).toMatchObject({ detail: "85,190 steps", fraction: null });
    expect(describeProgress({ stage: "Importing", done: 2_500_000, total: 10_000_000 }, UNITS)).toEqual({
      title: "Importing the file",
      detail: "2.5 of 10 MB",
      fraction: 0.25,
    });
  });

  it("looks up a prefixed stage by its name", () => {
    expect(describeProgress({ stage: "orders: Aligning variants", done: 1, total: 4 }, UNITS)).toEqual({
      title: "orders: aligning variants",
      detail: "1 of 4 variants",
      fraction: 0.25,
    });
    expect(describeProgress({ stage: "Importing events", done: 50, total: 100 }, UNITS)).toMatchObject({
      title: "Importing events",
      detail: "50 of 100",
    });
  });
});
