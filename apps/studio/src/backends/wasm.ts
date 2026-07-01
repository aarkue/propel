import type {
  ArtifactInfo,
  BackendContext,
  CallBinding,
  FunctionMeta,
  ItemKindInfo,
  LoadedObject,
} from "@r4pm/client";

/**
 * WASM: the engine runs as a wasm module in a dedicated Web Worker (wasm.worker.ts),
 * to prevent freezing the UI/main thread.
 */
export function createWasmBackend(): BackendContext {
  const worker = new Worker(new URL("./wasm.worker.ts", import.meta.url), { type: "module" });

  const listeners = new Map<string, Set<(data: unknown) => void>>();
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  let seq = 0;

  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data;
    if (msg.type === "event") {
      for (const l of listeners.get(msg.name) ?? []) l(msg.data);
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if ("error" in msg) p.reject(new Error(msg.error));
    else p.resolve(msg.result);
  };

  const call = (method: string, args: unknown[], transfer: Transferable[] = []): Promise<unknown> => {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, method, args }, transfer);
    });
  };

  const ready = call("ready", []).then(() => undefined);

  return {
    kind: "wasm",
    ready,
    callBinding: ((id: string, args: unknown, opts?: { outputName?: string }) =>
      call("callBinding", [id, args, opts?.outputName])) as CallBinding,
    async listObjects(): Promise<LoadedObject[]> {
      return (await call("listObjects", [])) as LoadedObject[];
    },
    async listFunctions(): Promise<FunctionMeta[]> {
      return (await call("listFunctions", [])) as FunctionMeta[];
    },
    async listItemKinds(): Promise<ItemKindInfo[]> {
      return (await call("listItemKinds", [])) as ItemKindInfo[];
    },
    async loadItem(id, kind, data, format) {
      // Transfer the file bytes to the worker (zero-copy) instead of cloning them.
      await call("loadItem", [id, kind, data, format], [data.buffer]);
    },
    async exportObject(name, format) {
      return (await call("exportObject", [name, format])) as Uint8Array;
    },
    async unloadObject(name) {
      await call("unloadObject", [name]);
    },
    async loadArtifactBytes(id, kind, data, format) {
      await call("loadArtifactBytes", [id, kind, data, format], [data.buffer]);
    },
    async listArtifacts() {
      return (await call("listArtifacts", [])) as ArtifactInfo[];
    },
    async getArtifact(id) {
      return await call("getArtifact", [id]);
    },
    async unloadArtifact(id) {
      await call("unloadArtifact", [id]);
    },
    async exportArtifact(id, format) {
      return (await call("exportArtifact", [id, format])) as Uint8Array;
    },
    async saveBytes(data, filename, mime) {
      const url = URL.createObjectURL(new Blob([data as BlobPart], mime ? { type: mime } : undefined));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    async registerListener<T>(event: string, listener: (data: T) => void) {
      const fn = listener as (data: unknown) => void;
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(fn);
      return () => set.delete(fn);
    },
  };
}
