import { describe, expect, it } from "vitest";
import { stripFit } from "./involvement-strip";

const counts = (fit: { rows: number[][]; hidden: number }) => ({
  shown: fit.rows.flat().length,
  rows: fit.rows.length,
  hidden: fit.hidden,
});

const types = (n: number, many = false) => Array.from({ length: n }, (_, i) => ({ name: `t${i}`, many }));

describe("stripFit", () => {
  it("shows every type that fits in two rows", () => {
    expect(counts(stripFit(types(6), "dots"))).toEqual({ shown: 6, rows: 1, hidden: 0 });
    expect(counts(stripFit(types(16), "dots"))).toEqual({ shown: 16, rows: 2, hidden: 0 });
  });

  it("ends the second row with +k when more do not fit", () => {
    // Two rows of 134px at 8.66px a disc and 6px gaps hold 18 discs. "+14" takes two of them.
    // rust4pm's export test pins the same numbers.
    expect(counts(stripFit(types(30), "dots"))).toEqual({ shown: 16, rows: 2, hidden: 14 });
  });

  it("fits fewer wide clusters and names", () => {
    expect(counts(stripFit(types(30, true), "dots")).shown).toBeLessThan(
      counts(stripFit(types(30), "dots")).shown,
    );
    const names = stripFit(
      Array.from({ length: 12 }, (_, i) => ({ name: `object type ${i}`, many: false })),
      "names",
    );
    expect(counts(names).shown).toBeLessThan(6);
    expect(counts(names).shown + names.hidden).toBe(12);
  });
});
