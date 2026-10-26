import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BINDING_RETURN_TYPE, type BackendContext, type FunctionMeta } from "@r4pm/client";
import { describe, expect, it } from "vitest";
import {
  ALPHA_PETRI_NET,
  DEFAULT_MINER,
  discoverPetriNet,
  discoverProcessTree,
  IM_OPTIONS,
  IM_PETRI_NET,
  IM_PROCESS_TREE,
  type MinerChoice,
  minerChoice,
} from "./_discovery";
import { DFG_SETTINGS, LOG_SETTINGS } from "./_miner-settings";

const here = dirname(fileURLToPath(import.meta.url));
const metas: FunctionMeta[] = JSON.parse(
  readFileSync(join(here, "../../../../packages/client/gen/bindings-meta.json"), "utf8"),
);
const meta = (id: string) => {
  const m = metas.find((f) => f.id === id);
  if (!m) throw new Error(`no binding ${id}`);
  return m;
};

function expectArgsFit(id: string, args: Record<string, unknown>) {
  const m = meta(id);
  const names = m.args.map(([name]) => name);
  for (const key of Object.keys(args)) expect(names).toContain(key);
  for (const required of m.required_args) expect(args).toHaveProperty(required);
}

const PRESET_OPTIONS = { kind: "log", noise_threshold: 0.2, fold: true, strict_sequence: true };

/** Answers preset calls with `PRESET_OPTIONS` and records every call. */
function recordingBackend() {
  const calls: [string, Record<string, unknown>][] = [];
  const backend = {
    callBinding: async (id: string, args: Record<string, unknown>) => {
      calls.push([id, args]);
      return id === IM_OPTIONS ? PRESET_OPTIONS : {};
    },
  } as unknown as Pick<BackendContext, "callBinding">;
  return { backend, calls };
}

const choice = (c: Partial<MinerChoice>): MinerChoice => ({ ...DEFAULT_MINER, ...c });

describe("Inductive Miner bindings", () => {
  it("are listed with ProcessTree and AcceptingPetriNet results", () => {
    expect(meta(IM_PROCESS_TREE).name).toBe("discover_inductive_tree_with");
    expect(meta(IM_PETRI_NET).name).toBe("discover_inductive_net_with");
    expect(BINDING_RETURN_TYPE[IM_PROCESS_TREE]).toBe("ProcessTree");
    for (const id of [IM_PETRI_NET, ALPHA_PETRI_NET]) {
      expect(BINDING_RETURN_TYPE[id]).toBe("AcceptingPetriNet");
    }
  });

  it("read an activity projection, which the engine converts from the event log", () => {
    for (const id of [IM_PROCESS_TREE, IM_PETRI_NET]) {
      const log = meta(id).args.find(([name]) => name === "log")?.[1];
      expect(log?.["x-registry-ref"]).toBe("EventLogActivityProjection");
    }
  });
});

describe("discovery", () => {
  it("runs IMf at 0.2 from rust4pm's default preset by default", async () => {
    const { backend, calls } = recordingBackend();
    await discoverPetriNet(backend, "log-1", DEFAULT_MINER);
    expect(calls).toEqual([
      [IM_OPTIONS, { variant: "IMf", preset: "default", noise_threshold: 0.2 }],
      [IM_PETRI_NET, { log: "log-1", miner: PRESET_OPTIONS }],
    ]);
    for (const [id, args] of calls) expectArgsFit(id, args);
  });

  it("applies the tweaks over the preset, ignoring settings the preset lacks", async () => {
    const { backend, calls } = recordingBackend();
    await discoverPetriNet(backend, "log-1", choice({ tweaks: { fold: false, use_tau_loops: true } }));
    expect(calls[1][1].miner).toEqual({ ...PRESET_OPTIONS, fold: false });
  });

  it("asks for IMd without noise", async () => {
    const { backend, calls } = recordingBackend();
    await discoverProcessTree(backend, "log-1", choice({ variant: "IMd", preset: "prom" }));
    expect(calls.map(([id]) => id)).toEqual([IM_OPTIONS, IM_PROCESS_TREE]);
    expect(calls[0][1]).toEqual({ variant: "IMd", preset: "prom", noise_threshold: 0 });
    for (const [id, args] of calls) expectArgsFit(id, args);
  });

  it("runs IMa from the default preset, with noise as IMfa", async () => {
    const { backend, calls } = recordingBackend();
    await discoverPetriNet(backend, "log-1", choice({ variant: "IMa", preset: "pm4py" }));
    expect(calls[0]).toEqual([IM_OPTIONS, { variant: "IMa", preset: "default", noise_threshold: 0.2 }]);
  });

  it("runs Alpha+++ on the event log", async () => {
    const { backend, calls } = recordingBackend();
    await discoverPetriNet(backend, "log-1", choice({ variant: "Alpha" }));
    expect(calls).toEqual([[ALPHA_PETRI_NET, { event_log: "log-1" }]]);
  });
});

describe("minerChoice", () => {
  it("falls back to the default for anything stored in another shape", () => {
    expect(minerChoice(undefined, ["IM", "IMf"])).toEqual(DEFAULT_MINER);
    expect(minerChoice({ algorithm: "alphappp" }, ["IM", "IMf"])).toEqual(DEFAULT_MINER);
    expect(minerChoice({ variant: "IMd", noise: 7 }, ["IM", "IMf"]).variant).toBe("IMf");
    expect(minerChoice({ variant: "IMd", noise: 7 }, ["IMd"])).toMatchObject({ variant: "IMd", noise: 0.2 });
  });
});

describe("the fine-tune settings", () => {
  const settingsOf = (options: string) => {
    const schema = meta(IM_PROCESS_TREE).args.find(([name]) => name === "miner")?.[1] as
      | { $defs?: Record<string, { properties?: object }> }
      | undefined;
    return Object.keys(schema?.$defs?.[options]?.properties ?? {}).filter((k) => k !== "noise_threshold");
  };

  it("are every setting of rust4pm's options", () => {
    expect(LOG_SETTINGS.map((s) => s.key).sort()).toEqual(settingsOf("InductiveMinerOptions").sort());
    expect(DFG_SETTINGS.map((s) => s.key).sort()).toEqual(settingsOf("InductiveMinerDfgOptions").sort());
  });
});
