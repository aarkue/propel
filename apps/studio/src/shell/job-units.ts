import type { ProgressUnits } from "@r4pm/components";

function megabytes(n: number): string {
  const mb = n / 1e6;
  return mb.toLocaleString("en", { maximumFractionDigits: mb < 10 ? 1 : 0 });
}

/** What the stages of rust4pm and propel's bindings count. */
export const JOB_UNITS: ProgressUnits = {
  "Aligning variants": { noun: "variants" },
  "Retrying variants with more memory": { noun: "variants" },
  "Measuring escaping edges": { noun: "variants" },
  "Mining process tree": { noun: "steps" },
  "Discovering nets per object type": { noun: "object types" },
  "Finding candidates": { noun: "activity pairs" },
  "Reducing constraints": { noun: "constraints" },
  "Refining constraints": { noun: "activity pairs" },
  "Finding connections": { noun: "sources" },
  "Summarizing connections": { noun: "sources" },
  "Enumerating path schemas": { noun: "paths explored" },
  "Building activity grid": { noun: "cells" },
  "Expanding schemas": { noun: "candidates" },
  "Searching schemas": { noun: "steps", totalIsLimit: true },
  "Evaluating constraints": { noun: "constraints" },
  "Checking the constraint": { noun: "source events" },
  "Measuring the constraint's durations": { noun: "source events" },
  // Reading a file, in bytes; its tables follow as "Importing <table>".
  Importing: { title: "Importing the file", noun: "MB", format: megabytes },
};
