import type {
  AcceptingPetriNet,
  BackendContext,
  EventLogActivityProjectionHandle,
  EventLogHandle,
  InductiveMiner,
} from "@r4pm/client";

// Case-centric discovery calls shared by the Petri net, process tree and OCPN vizzes. `_`-prefixed
// so the vis registry glob skips it.

const IM = "process_mining::discovery::case_centric::inductive_miner" as const;
export const IM_PROCESS_TREE = `${IM}::discover_inductive_tree_with` as const;
export const IM_PETRI_NET = `${IM}::discover_inductive_net_with` as const;
export const IM_OPTIONS = `${IM}::inductive_miner_options` as const;
export const ALPHA_PETRI_NET = "app_bindings::discover_petri_net" as const;

export type MinerVariant = "IM" | "IMf" | "IMa" | "IMd" | "IMfd" | "Alpha";
/** The tool whose Inductive Miner a run imitates, as rust4pm's presets name them. */
export type MinerPreset = "default" | "prom" | "pm4py";

/** What a discovery view runs: a variant, its noise threshold (IMf, IMa and IMfd only), the tool it
 *  behaves like, and the settings changed from that tool's preset. */
export interface MinerChoice {
  variant: MinerVariant;
  noise: number;
  preset: MinerPreset;
  tweaks: Record<string, boolean>;
}

export const PETRI_NET_VARIANTS: readonly MinerVariant[] = ["IM", "IMf", "IMa", "IMd", "IMfd", "Alpha"];

export const DEFAULT_MINER: MinerChoice = { variant: "IMf", noise: 0.2, preset: "default", tweaks: {} };

export const usesNoise = (v: MinerVariant) => v === "IMf" || v === "IMa" || v === "IMfd";
export const usesDfg = (v: MinerVariant) => v === "IMd" || v === "IMfd";
/** IMa and Alpha+++ have no tool presets to choose from. */
export const usesPreset = (v: MinerVariant) => v !== "IMa" && v !== "Alpha";

const PRESETS: readonly MinerPreset[] = ["default", "prom", "pm4py"];

/** A stored choice, or the default for anything else (e.g., controls saved in another shape). */
export function minerChoice(raw: unknown, variants: readonly MinerVariant[]): MinerChoice {
  const c = (raw ?? {}) as Partial<MinerChoice>;
  const variant = variants.includes(c.variant as MinerVariant)
    ? (c.variant as MinerVariant)
    : variants.includes(DEFAULT_MINER.variant)
      ? DEFAULT_MINER.variant
      : variants[0];
  const noise = typeof c.noise === "number" && c.noise >= 0 && c.noise <= 1 ? c.noise : DEFAULT_MINER.noise;
  const preset = PRESETS.includes(c.preset as MinerPreset) ? (c.preset as MinerPreset) : "default";
  const tweaks = c.tweaks && typeof c.tweaks === "object" ? c.tweaks : {};
  return { variant, noise, preset, tweaks };
}

type Backend = Pick<BackendContext, "callBinding">;

/** The settings of the preset a choice starts from, before its tweaks. */
export function presetOptions(backend: Backend, choice: MinerChoice): Promise<InductiveMiner> {
  return backend.callBinding(IM_OPTIONS, {
    variant: choice.variant === "Alpha" ? "IMf" : choice.variant,
    preset: usesPreset(choice.variant) ? choice.preset : "default",
    noise_threshold: usesNoise(choice.variant) ? choice.noise : 0,
  });
}

/** The preset's options with the choice's tweaks applied. Tweaks of settings the preset does not
 *  have (e.g., left over from the other miner family) are ignored. */
export function withTweaks<O extends object>(preset: O, tweaks: Record<string, boolean>): O {
  const out = { ...preset } as Record<string, unknown>;
  for (const [key, value] of Object.entries(tweaks)) {
    if (typeof out[key] === "boolean") out[key] = value;
  }
  return out as O;
}

/** The miner a choice runs: its preset's settings with its tweaks. */
export async function inductiveMiner(backend: Backend, choice: MinerChoice): Promise<InductiveMiner> {
  return withTweaks(await presetOptions(backend, choice), choice.tweaks);
}

/** The IM bindings read an activity projection. The engine converts an `EventLog` handle passed
 *  there (and caches the projection), so the panel's event log id goes in as is. */
const projection = (eventLog: string) => eventLog as EventLogActivityProjectionHandle;

export async function discoverPetriNet(
  backend: Backend,
  eventLog: string,
  choice: MinerChoice,
): Promise<AcceptingPetriNet> {
  if (choice.variant === "Alpha") {
    return backend.callBinding(ALPHA_PETRI_NET, { event_log: eventLog as EventLogHandle });
  }
  const miner = await inductiveMiner(backend, choice);
  return backend.callBinding(IM_PETRI_NET, { log: projection(eventLog), miner });
}

export async function discoverProcessTree(backend: Backend, eventLog: string, choice: MinerChoice) {
  const miner = await inductiveMiner(backend, choice);
  return backend.callBinding(IM_PROCESS_TREE, { log: projection(eventLog), miner });
}
