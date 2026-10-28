import { beforeEach, describe, expect, it } from "vitest";
import { useArtifacts } from "./artifacts";
import { useDatasets } from "./datasets";
import { derivedDatasetLabel, describeProvenance, objectLabel } from "./naming";

describe("naming", () => {
  beforeEach(() => {
    useDatasets.setState({ datasets: [{ id: "rtfm", kind: "EventLog", label: "Road Traffic" }] });
    useArtifacts.setState({
      artifacts: [{ id: "Petri net", kind: "PetriNet", label: "IMf of Road Traffic" }],
    });
  });

  it("labels datasets and artifacts, falling back to the id", () => {
    expect(objectLabel("rtfm")).toBe("Road Traffic");
    expect(objectLabel("Petri net")).toBe("IMf of Road Traffic");
    expect(objectLabel("res_123")).toBe("res_123");
  });

  it("prefixes derived labels with the source and keeps them unique", () => {
    expect(derivedDatasetLabel("rtfm", "kept 3 variants")).toBe("Road Traffic / kept 3 variants");
    useDatasets.setState({
      datasets: [
        { id: "rtfm", kind: "EventLog", label: "Road Traffic" },
        { id: "d2", kind: "EventLog", label: "Road Traffic / kept 3 variants" },
      ],
    });
    expect(derivedDatasetLabel("rtfm", "kept 3 variants")).toBe("Road Traffic / kept 3 variants 2");
  });

  it("describes provenance by source labels and op", () => {
    const op = { fn: "app_bindings::transforms::apply_event_log_transforms", args: {} };
    expect(describeProvenance({ sources: ["rtfm"], op, source_gen: 0 })).toBe(
      "From Road Traffic via apply event log transforms",
    );
    expect(describeProvenance({ sources: ["rtfm"], op: JSON.stringify(op), source_gen: 0 })).toBe(
      "From Road Traffic via apply event log transforms",
    );
    expect(describeProvenance({ sources: ["rtfm"], op: "convert:EventLog", source_gen: 0 })).toBe(
      "From Road Traffic via conversion to EventLog",
    );
    expect(describeProvenance({ sources: [], op, source_gen: 0 })).toBe(
      "Created via apply event log transforms",
    );
  });
});
