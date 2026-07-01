import { describe, expect, it, beforeEach } from "vitest";
import { useArtifacts } from "./artifacts";

describe("useArtifacts", () => {
  beforeEach(() => useArtifacts.setState({ artifacts: [] }));

  it("adds + upserts by id", () => {
    useArtifacts.getState().addArtifact({ id: "n1", kind: "PetriNet", label: "a" });
    useArtifacts.getState().addArtifact({ id: "n1", kind: "PetriNet", label: "b" });
    expect(useArtifacts.getState().artifacts).toEqual([{ id: "n1", kind: "PetriNet", label: "b" }]);
  });

  it("syncArtifacts reconciles to the engine list, keeping richer labels", () => {
    useArtifacts.getState().addArtifact({ id: "n1", kind: "PetriNet", label: "nice" });
    useArtifacts.getState().syncArtifacts([
      { id: "n1", kind: "PetriNet" },
      { id: "n2", kind: "PetriNet" },
    ]);
    const a = useArtifacts.getState().artifacts;
    expect(a.find((x) => x.id === "n1")?.label).toBe("nice");
    expect(a.find((x) => x.id === "n2")?.label).toBe("n2");
  });

  it("removes by id", () => {
    useArtifacts.getState().addArtifact({ id: "n1", kind: "PetriNet", label: "a" });
    useArtifacts.getState().removeArtifact("n1");
    expect(useArtifacts.getState().artifacts).toEqual([]);
  });
});
