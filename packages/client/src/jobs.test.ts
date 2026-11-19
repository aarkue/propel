import { describe, expect, it } from "vitest";
import { CANCELLED, CancelledError, createJobRunner, type JobUpdate } from "./jobs";

function transport() {
  let handler: ((u: JobUpdate) => void) | undefined;
  const cancelled: string[] = [];
  const runJob = createJobRunner({
    listen: async (h) => {
      handler = h;
    },
    cancel: (job) => void cancelled.push(job),
  });
  return { runJob, cancelled, send: (u: JobUpdate) => handler?.(u) };
}

describe("createJobRunner", () => {
  it("calls without a job when nobody listens", async () => {
    const { runJob } = transport();
    expect(await runJob(undefined, async (job) => job)).toBeUndefined();
  });

  it("routes a job's progress and partials to its call only", async () => {
    const { runJob, send } = transport();
    const seen: unknown[] = [];
    const out = await runJob(
      { onProgress: (p) => seen.push(p.done), onPartial: (v) => seen.push(...v) },
      async (job) => {
        send({ job: "other", progress: { stage: "x", done: 9 } });
        send({ job: job as string, progress: { stage: "x", done: 1, total: 2 }, partials: ["a"] });
        return "done";
      },
    );
    expect(out).toBe("done");
    expect(seen).toEqual(["a", 1]);
  });

  it("cancels the job on abort and rejects with CancelledError", async () => {
    const { runJob, cancelled } = transport();
    const abort = new AbortController();
    const call = runJob({ signal: abort.signal }, async () => {
      abort.abort();
      throw new Error(CANCELLED);
    });
    await expect(call).rejects.toBeInstanceOf(CancelledError);
    expect(cancelled).toHaveLength(1);
  });

  it("listens again after a failed listen", async () => {
    let attempts = 0;
    const runJob = createJobRunner({
      listen: async () => {
        if (++attempts === 1) throw new Error("no channel");
      },
      cancel: () => {},
    });
    const opts = { onProgress: () => {} };
    await expect(runJob(opts, async () => "a")).rejects.toThrow("no channel");
    expect(await runJob(opts, async () => "b")).toBe("b");
    expect(attempts).toBe(2);
  });

  it("does not start a call aborted while it waited for the listener", async () => {
    let listened: () => void = () => {};
    const runJob = createJobRunner({
      listen: () => new Promise<void>((resolve) => (listened = resolve)),
      cancel: () => {},
    });
    const abort = new AbortController();
    let started = false;
    const call = runJob({ signal: abort.signal }, async () => {
      started = true;
    });
    abort.abort();
    listened();
    await expect(call).rejects.toBeInstanceOf(CancelledError);
    expect(started).toBe(false);
  });

  it("swallows a failed cancel", async () => {
    const runJob = createJobRunner({
      listen: async () => {},
      cancel: async () => {
        throw new Error("gone");
      },
    });
    const abort = new AbortController();
    const call = runJob({ signal: abort.signal }, async () => {
      abort.abort();
      await new Promise((r) => setTimeout(r, 0));
      return "ran";
    });
    // The call runs to its end, and no rejection is left unhandled.
    expect(await call).toBe("ran");
  });
});
