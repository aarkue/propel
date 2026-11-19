import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import "@r4pm/components/styles.css";
import {
  type Ocpn,
  OcpnAnimation,
  type OcpnAnimationData,
  type OcpnReplay,
  ViewStateProvider,
} from "@r4pm/components";

const meta = {
  title: "Viewers/Object-Centric Petri Net Animation",
  component: OcpnAnimation,
  parameters: { frame: { mode: "canvas", height: 620 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof OcpnAnimation>;
export default meta;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Small seeded PRNG, so the sample data is the same on every load. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Order management in rust4pm's flat OCPN form. An order is paid before it is packed, and each order
// ships in one package with all of its items (variable arcs). Out-of-stock items are reordered; a
// silent transition lets the others go straight to picking.
const ocpn: Ocpn = {
  places: [
    ...["o_src", "o_placed", "o_confirmed", "o_paid", "o_done"].map((name) => ({
      name,
      object_type: "orders",
    })),
    ...["i_src", "i_placed", "i_missing", "i_ready", "i_picked", "i_packed", "i_sent", "i_done"].map(
      (name) => ({
        name,
        object_type: "items",
      }),
    ),
    ...["k_src", "k_packed", "k_sent", "k_done"].map((name) => ({ name, object_type: "packages" })),
  ],
  transitions: [
    { name: "place order", label: "place order" },
    { name: "confirm order", label: "confirm order" },
    { name: "pay order", label: "pay order" },
    { name: "payment reminder", label: "payment reminder" },
    { name: "items tau 1", label: null },
    { name: "item out of stock", label: "item out of stock" },
    { name: "reorder item", label: "reorder item" },
    { name: "pick item", label: "pick item" },
    { name: "create package", label: "create package" },
    { name: "send package", label: "send package" },
    { name: "package delivered", label: "package delivered" },
  ],
  arcs: [
    { source: "o_src", target: "place order" },
    { source: "place order", target: "o_placed" },
    { source: "o_placed", target: "confirm order" },
    { source: "confirm order", target: "o_confirmed" },
    { source: "o_confirmed", target: "payment reminder" },
    { source: "payment reminder", target: "o_confirmed" },
    { source: "o_confirmed", target: "pay order" },
    { source: "pay order", target: "o_paid" },
    { source: "o_paid", target: "create package" },
    { source: "create package", target: "o_done" },
    { source: "i_src", target: "place order", type: "variable" },
    { source: "place order", target: "i_placed", type: "variable" },
    { source: "i_placed", target: "items tau 1" },
    { source: "items tau 1", target: "i_ready" },
    { source: "i_placed", target: "item out of stock" },
    { source: "item out of stock", target: "i_missing" },
    { source: "i_missing", target: "reorder item" },
    { source: "reorder item", target: "i_ready" },
    { source: "i_ready", target: "pick item" },
    { source: "pick item", target: "i_picked" },
    { source: "i_picked", target: "create package", type: "variable" },
    { source: "create package", target: "i_packed", type: "variable" },
    { source: "i_packed", target: "send package", type: "variable" },
    { source: "send package", target: "i_sent", type: "variable" },
    { source: "i_sent", target: "package delivered", type: "variable" },
    { source: "package delivered", target: "i_done", type: "variable" },
    { source: "k_src", target: "create package" },
    { source: "create package", target: "k_packed" },
    { source: "k_packed", target: "send package" },
    { source: "send package", target: "k_sent" },
    { source: "k_sent", target: "package delivered" },
    { source: "package delivered", target: "k_done" },
  ],
  initial_marking: { o_src: 1, i_src: 1, k_src: 1 },
  final_marking: { o_done: 1, i_done: 1, k_done: 1 },
};

type Journey = OcpnReplay["journeys"][number];
type Event = { activity: string; time: number; objects: Journey[] };

const tr = (name: string) => ocpn.transitions.findIndex((t) => t.name === name);

/**
 * Replays orders with their items and packages, the way the binding reports them: each object's
 * firings on its type's net, conformance per type and transition, and the waiting at the
 * activities several types share. A few items are never picked (the net skips the step) and a few
 * orders get a reminder after they are paid (an event the net cannot follow).
 */
function orderReplay(orders: number, seed: number): OcpnReplay {
  const r = mulberry32(seed);
  const between = (lo: number, hi: number) => Math.round(lo + r() * (hi - lo));
  const journeys: Journey[] = [];
  const events: Event[] = [];
  const fire = (j: Journey, activity: string, time: number) =>
    j.firings.push({ transition: tr(activity), time, sync: true });
  const event = (activity: string, time: number, objects: Journey[]) => {
    for (const j of objects) fire(j, activity, time);
    events.push({ activity, time, objects });
  };
  let item = 880001;
  let t = Date.UTC(2023, 2, 6, 9, 0);
  for (let k = 0; k < orders; k++) {
    t += between(4 * HOUR, 30 * HOUR);
    const order: Journey = { id: `o-${990001 + k}`, object_type: "orders", firings: [], log_moves: [] };
    const pkg: Journey = { id: `p-${660001 + k}`, object_type: "packages", firings: [], log_moves: [] };
    const items: Journey[] = Array.from({ length: 1 + Math.floor(r() * 4) }, () => ({
      id: `i-${item++}`,
      object_type: "items",
      firings: [],
      log_moves: [],
    }));
    journeys.push(order, ...items, pkg);
    event("place order", t, [order, ...items]);
    const confirmed = t + between(HOUR, 20 * HOUR);
    event("confirm order", confirmed, [order]);
    let paid = confirmed + between(DAY / 2, 4 * DAY);
    if (r() < 0.25) {
      const reminder = confirmed + between(5 * DAY, 8 * DAY);
      event("payment reminder", reminder, [order]);
      paid = reminder + between(DAY, 3 * DAY);
    }
    event("pay order", paid, [order]);
    let ready = paid;
    if (r() < 0.1) {
      const late = paid + between(2 * HOUR, 10 * HOUR);
      order.log_moves?.push(["payment reminder", late]);
      events.push({ activity: "payment reminder", time: late, objects: [order] });
      ready = late;
    }
    for (const it of items) {
      let last = t;
      if (r() < 0.12) {
        const out = confirmed + between(HOUR, 6 * HOUR);
        event("item out of stock", out, [it]);
        last = out + between(DAY, 3 * DAY);
        event("reorder item", last, [it]);
      } else {
        it.firings.push({ transition: tr("items tau 1"), time: t, sync: false });
      }
      if (r() < 0.06) {
        it.firings.push({ transition: tr("pick item"), time: last, sync: false });
      } else {
        last = Math.max(last, confirmed) + between(2 * HOUR, 60 * HOUR);
        event("pick item", last, [it]);
      }
      ready = Math.max(ready, last);
    }
    const packed = ready + between(HOUR, 6 * HOUR);
    event("create package", packed, [order, ...items, pkg]);
    const sent = packed + between(2 * HOUR, 24 * HOUR);
    event("send package", sent, [...items, pkg]);
    event("package delivered", sent + between(DAY, 4 * DAY), [...items, pkg]);
  }
  for (const j of journeys) j.firings.sort((a, b) => a.time - b.time);
  events.sort((a, b) => a.time - b.time);
  const types = ["items", "orders", "packages"];
  const times = events.map((e) => e.time);
  return {
    journeys,
    total_objects: journeys.length,
    min_ms: Math.min(...times),
    max_ms: Math.max(...times),
    types: types.map((type) => typeConformance(type, journeys)),
    transitions: ocpn.transitions.flatMap((_, transition) =>
      types.flatMap((object_type) => {
        const fired = journeys
          .filter((j) => j.object_type === object_type)
          .flatMap((j) => j.firings.filter((f) => f.transition === transition));
        const sync = fired.filter((f) => f.sync).length;
        return fired.length ? [{ transition, object_type, sync, model: fired.length - sync }] : [];
      }),
    ),
    sync: syncPoints(events),
  };
}

function typeConformance(type: string, journeys: Journey[]): OcpnReplay["types"][number] {
  const ofType = journeys.filter((j) => j.object_type === type);
  const deviations = ofType.map(
    (j) =>
      j.firings.filter((f) => !f.sync && ocpn.transitions[f.transition].label).length +
      (j.log_moves?.length ?? 0),
  );
  const moves = ofType.map((j) => j.firings.length + (j.log_moves?.length ?? 0));
  const logMoves = new Map<string, number>();
  for (const j of ofType) for (const [a] of j.log_moves ?? []) logMoves.set(a, (logMoves.get(a) ?? 0) + 1);
  return {
    object_type: type,
    objects: ofType.length,
    fitness: ofType.reduce((s, _, i) => s + 1 - deviations[i] / Math.max(1, moves[i]), 0) / ofType.length,
    perfectly_fitting: deviations.filter((d) => d === 0).length / ofType.length,
    unaligned: 0,
    log_moves: [...logMoves.entries()].sort((a, b) => b[1] - a[1]),
  };
}

/** Per shared activity: from the first object type being ready (its previous event) to the last. */
function syncPoints(events: Event[]): OcpnReplay["sync"] {
  const lastSeen = new Map<string, number>();
  const waits = new Map<string, { waits: number[]; last: Map<string, number>; together: number }>();
  for (const e of events) {
    const ready = new Map<string, number>();
    for (const j of e.objects) {
      const prev = lastSeen.get(j.id);
      if (prev !== undefined) ready.set(j.object_type, Math.max(ready.get(j.object_type) ?? prev, prev));
      lastSeen.set(j.id, e.time);
    }
    if (ready.size < 2) continue;
    const at = waits.get(e.activity) ?? {
      waits: [] as number[],
      last: new Map<string, number>(),
      together: 0,
    };
    const sorted = [...ready.entries()].sort((a, b) => a[1] - b[1]);
    const wait = sorted[sorted.length - 1][1] - sorted[0][1];
    at.waits.push(wait);
    if (wait === 0) at.together++;
    else {
      const lastType = sorted[sorted.length - 1][0];
      at.last.set(lastType, (at.last.get(lastType) ?? 0) + 1);
    }
    waits.set(e.activity, at);
  }
  return [...waits.entries()]
    .map(([activity, w]) => {
      const s = [...w.waits].sort((a, b) => a - b);
      return {
        activity,
        transition: tr(activity),
        events: s.length,
        median_wait_ms: s[Math.floor(s.length / 2)],
        p90_wait_ms: s[Math.min(s.length - 1, Math.floor(s.length * 0.9))],
        mean_wait_ms: s.reduce((a, b) => a + b, 0) / s.length,
        last_ready: [...w.last.entries()].sort((a, b) => b[1] - a[1]),
        simultaneous: w.together,
      };
    })
    .sort((a, b) => b.median_wait_ms - a.median_wait_ms || a.activity.localeCompare(b.activity));
}

const replay = orderReplay(18, 2);
const orders: OcpnAnimationData = { ocpn, replay };
const sampled: OcpnAnimationData = {
  ocpn,
  replay: { ...replay, journeys: replay.journeys.filter((_, i) => i % 3 === 0) },
};
const nothing: OcpnAnimationData = {
  ocpn,
  replay: { journeys: [], total_objects: 0, min_ms: 0, max_ms: 0, types: [], transitions: [], sync: [] },
};

/** Orders, items and packages replayed on their nets: tokens of each type meet where the types synchronize. */
export const Default: StoryObj = {
  name: "Order management",
  render: () => <OcpnAnimation data={orders} />,
};

/** The conformance tab: fitness per type, skipped steps on the net, and how long packing waits for orders or items. */
export const Conformance: StoryObj = {
  name: "Conformance",
  render: function ConformanceStory() {
    const [viewState, setViewState] = useState<Record<string, unknown>>({
      "ocpnAnimation.tab": "conformance",
    });
    return (
      <ViewStateProvider viewState={viewState} onViewStateChange={setViewState}>
        <OcpnAnimation data={orders} />
      </ViewStateProvider>
    );
  },
};

/** Only a third of the objects are replayed, which the legend notes next to the total. */
export const Sampled: StoryObj = {
  name: "Sampled objects",
  render: () => <OcpnAnimation data={sampled} />,
};

/** No object of the net's types could be aligned, so there is nothing to replay. */
export const Empty: StoryObj = {
  name: "Nothing to replay",
  render: () => <OcpnAnimation data={nothing} />,
};
