import { describe, expect, it } from "vitest";
import { completeExtension, dialogExtension, exportFileName } from "./export-name";

describe("exportFileName", () => {
  it("drops the extension the label was imported with", () => {
    expect(exportFileName("rtfm.xes", "xes.gz")).toBe("rtfm.xes.gz");
    expect(exportFileName("rtfm.xes.gz", "xes")).toBe("rtfm.xes");
    expect(exportFileName("order-management.sqlite3", "jsonocel")).toBe("order-management.jsonocel");
  });

  it("keeps labels without an extension, minus path separators", () => {
    expect(exportFileName("Road Traffic / kept 3 variants", "xes")).toBe(
      "Road Traffic - kept 3 variants.xes",
    );
    expect(exportFileName("log v1.2", "xes")).toBe("log v1.2.xes");
    expect(exportFileName('a:b*c?"d"', "xes")).toBe("a-b-c-d.xes");
  });

  it("falls back when nothing is left", () => {
    expect(exportFileName("///", "xes")).toBe("export.xes");
  });
});

describe("dialogExtension", () => {
  it("is the last part of a compound extension", () => {
    expect(dialogExtension("xes.gz")).toBe("gz");
    expect(dialogExtension("xes")).toBe("xes");
  });
});

describe("completeExtension", () => {
  it("completes a cut-short compound extension", () => {
    expect(completeExtension("C:\\logs\\rtfm.xes", "xes.gz")).toBe("C:\\logs\\rtfm.xes.gz");
    expect(completeExtension("C:\\logs\\rtfm.XES.GZ", "xes.gz")).toBe("C:\\logs\\rtfm.XES.GZ");
  });

  it("leaves other names alone", () => {
    expect(completeExtension("/tmp/rtfm.gz", "xes.gz")).toBe("/tmp/rtfm.gz");
    expect(completeExtension("/tmp/rtfm.xes", "xes")).toBe("/tmp/rtfm.xes");
    expect(completeExtension("/tmp/rtfm", "xes")).toBe("/tmp/rtfm");
  });
});
