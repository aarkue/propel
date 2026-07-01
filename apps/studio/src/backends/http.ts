import type {
  ArtifactInfo,
  BackendContext,
  CallBinding,
  FunctionMeta,
  ItemKindInfo,
  LoadedObject,
} from "@r4pm/client";

/**
 * Remote backend: the engine runs in the `engine/webserver` (axum) process; this talks to it
 * over HTTP. The endpoint contract here is the source of truth the server implements.
 *
 * `base` is the API root ("/api" in prod where axum serves the UI too, or a full origin in dev
 * where vite proxies "/api" to the axum port).
 */
export function createHttpBackend(base = "/api"): BackendContext {
  const root = base.replace(/\/$/, "");

  // One shared SSE connection for engine events (objects-changed, import-*), opened lazily on the
  // first registerListener so the backend holds no connection until something subscribes.
  let es: EventSource | undefined;
  const eventSource = (): EventSource => {
    es ??= new EventSource(`${root}/events`);
    return es;
  };

  async function fail(res: Response): Promise<never> {
    throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  }

  const callBinding = (async (
    id: string,
    args: unknown,
    opts?: { outputName?: string },
  ): Promise<unknown> => {
    const res = await fetch(`${root}/call`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, args, output_name: opts?.outputName }),
    });
    if (!res.ok) return fail(res);
    return res.json();
  }) as CallBinding;

  async function getJson<T>(path: string): Promise<T> {
    const res = await fetch(`${root}${path}`);
    if (!res.ok) return fail(res);
    return res.json() as Promise<T>;
  }

  return {
    kind: "http",
    ready: Promise.resolve(),
    callBinding,
    listObjects: () => getJson<LoadedObject[]>("/objects"),
    listFunctions: () => getJson<FunctionMeta[]>("/functions"),
    listItemKinds: () => getJson<ItemKindInfo[]>("/item-kinds"),
    async loadItem(id, kind, data, format) {
      const q = new URLSearchParams({ id, kind, format });
      const res = await fetch(`${root}/load?${q}`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: data as BodyInit,
      });
      if (!res.ok) await fail(res);
    },
    async exportObject(name, format) {
      const q = new URLSearchParams({ name, format });
      const res = await fetch(`${root}/export?${q}`);
      if (!res.ok) return fail(res);
      return new Uint8Array(await res.arrayBuffer());
    },
    async unloadObject(name) {
      const q = new URLSearchParams({ name });
      const res = await fetch(`${root}/unload?${q}`, { method: "POST" });
      if (!res.ok) await fail(res);
    },
    async loadArtifactBytes(id, kind, data, format) {
      const q = new URLSearchParams({ id, kind, format });
      const res = await fetch(`${root}/load-artifact?${q}`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: data as BodyInit,
      });
      if (!res.ok) await fail(res);
    },
    listArtifacts: () => getJson<ArtifactInfo[]>("/artifacts"),
    getArtifact: (id) => getJson<unknown>(`/artifact?${new URLSearchParams({ id })}`),
    async unloadArtifact(id) {
      const res = await fetch(`${root}/unload-artifact?${new URLSearchParams({ id })}`, { method: "POST" });
      if (!res.ok) await fail(res);
    },
    async exportArtifact(id, format) {
      const q = new URLSearchParams({ id, format });
      const res = await fetch(`${root}/export-artifact?${q}`);
      if (!res.ok) return fail(res);
      return new Uint8Array(await res.arrayBuffer());
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
      const handler = (e: MessageEvent) => listener(JSON.parse(e.data) as T);
      eventSource().addEventListener(event, handler as EventListener);
      return () => es?.removeEventListener(event, handler as EventListener);
    },
  };
}
