import type { FunctionMeta } from "@r4pm/client";
import { describe, expect, it } from "vitest";
import type { AppNode } from "./components/pipeline/editor/types";
import { migratePipeline } from "./migrate-pipeline";

const meta = (id: string, args: string[]) =>
  ({
    id,
    name: id.split("::").pop(),
    args: args.map((a) => [a, {}]),
    required_args: args,
  }) as unknown as FunctionMeta;
const fnNode = (id: string, m: FunctionMeta) =>
  ({ id, type: "function", position: { x: 0, y: 0 }, data: { functionMeta: m } }) as unknown as AppNode;

describe("migratePipeline", () => {
  it("moves v0.4.1 steps to the current binding and argument names", () => {
    const current = meta("process_mining::discover_ocpn", ["ocel", "options"]);
    const old = meta("process_mining::discovery::object_centric::ocpn::discover_ocpn", ["locel", "options"]);
    const out = migratePipeline(
      [fnNode("f", old)],
      [{ id: "e", source: "o", target: "f", targetHandle: "locel" }],
      [current],
    );
    expect(out?.nodes[0].data).toEqual({ functionMeta: current });
    expect(out?.edges[0].targetHandle).toBe("ocel");
  });

  it("gives a step the current metadata of its binding", () => {
    const current = {
      ...meta("process_mining::ocpn_svg", ["ocpn"]),
      return_type: { type: "string", contentMediaType: "image/svg+xml" },
    } as FunctionMeta;
    const saved = { ...meta("process_mining::ocpn_svg", ["ocpn"]), return_type: { type: "string" } };
    const edges = [{ id: "e", source: "o", target: "f", targetHandle: "ocpn" }];
    const out = migratePipeline([fnNode("f", saved as FunctionMeta)], edges, [current]);
    expect(out?.nodes[0].data).toEqual({ functionMeta: current });
    expect(out?.edges).toEqual(edges);
  });

  it("leaves current and unknown steps alone", () => {
    const current = meta("process_mining::discover_ocpn", ["ocel"]);
    expect(migratePipeline([fnNode("f", current)], [], [current])).toBeNull();
    expect(
      migratePipeline([fnNode("g", meta("process_mining::bindings::gone", []))], [], [current]),
    ).toBeNull();
  });
});
