import { describe, expect, test } from "vitest";
import { candidateByContent, sniffJsonKind } from "./file-kind";

describe("sniffJsonKind", () => {
  test("tells the JSON kinds apart by their top-level keys", () => {
    expect(sniffJsonKind('{"objectTypes":[],"eventTypes":[],"events":[],"objects":[]}', true)).toBe(
      "SlimLinkedOCEL",
    );
    expect(sniffJsonKind('{"root":{"operator":"Sequence","children":[]}}', true)).toBe("ProcessTree");
    expect(
      sniffJsonKind(
        '{"places":[{"name":"p1"}],"transitions":[],"initial_marking":{},"final_marking":{}}',
        true,
      ),
    ).toBe("AcceptingPetriNet");
    expect(
      sniffJsonKind(
        '{"places":[{"name":"p1","object_type":"order"}],"transitions":[],"arcs":[],"initial_marking":{},"final_marking":{}}',
        true,
      ),
    ).toBe("ObjectCentricPetriNet");
  });

  test("the older Petri net shape with keyed places is a Petri net", () => {
    expect(sniffJsonKind('{"places":{"a":{}},"transitions":{},"arcs":[],"initial_marking":{}}', true)).toBe(
      "AcceptingPetriNet",
    );
  });

  test("of a long file, only an OCEL is recognized, by its keys near the start", () => {
    expect(sniffJsonKind('{"objectTypes": [{"name":"order"', false)).toBe("SlimLinkedOCEL");
    expect(sniffJsonKind('{"events": [', false)).toBeNull();
  });

  test("unknown or broken JSON is left to the user", () => {
    expect(sniffJsonKind('{"foo":1}', true)).toBeNull();
    expect(sniffJsonKind("[1,2]", true)).toBeNull();
    expect(sniffJsonKind('{"objectTypes":', true)).toBeNull();
  });
});

describe("candidateByContent", () => {
  const cands = [
    { kind: "SlimLinkedOCEL", ext: "json", mime: "application/json" },
    { kind: "ProcessTree", ext: "json", mime: "application/json" },
  ];
  test("picks the candidate the content names", async () => {
    const read = async () => ({ text: '{"root":{}}', complete: true });
    expect((await candidateByContent(cands, read))?.kind).toBe("ProcessTree");
  });
  test("returns null when the named kind is not a candidate or reading fails", async () => {
    const read = async () => ({ text: '{"places":[],"initial_marking":{}}', complete: true });
    expect(await candidateByContent(cands, read)).toBeNull();
    expect(
      await candidateByContent(cands, async () => {
        throw new Error("gone");
      }),
    ).toBeNull();
  });
});
