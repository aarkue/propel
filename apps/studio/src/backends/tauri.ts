import type {
  ArtifactInfo,
  BackendContext,
  CallBinding,
  FunctionMeta,
  ItemKindInfo,
  LoadedObject,
} from "@r4pm/client";

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

/**
 * Desktop backend: the engine runs in the tauri process.
 * Calls `#[tauri::command]`s via `invoke`.
 * The command names + arg shapes match `engine/app/src/lib.rs`.
 */
export function createTauriBackend(): BackendContext {
  let invokeP: Promise<InvokeFn> | null = null;
  const invoke = async (): Promise<InvokeFn> => {
    // Import lazily.
    if (!invokeP) invokeP = import("@tauri-apps/api/core").then((m) => m.invoke as InvokeFn);
    return invokeP;
  };

  const callBinding = (async (id: string, args: unknown, opts?: { outputName?: string }): Promise<unknown> =>
    (await invoke())("execute_binding", {
      functionId: id,
      args,
      outputName: opts?.outputName,
    })) as CallBinding;

  return {
    kind: "tauri",
    ready: Promise.resolve(),
    callBinding,
    async listObjects() {
      return (await invoke())<LoadedObject[]>("get_all_objects_with_type");
    },
    async listFunctions() {
      return (await invoke())<FunctionMeta[]>("list_functions");
    },
    async listItemKinds() {
      return (await invoke())<ItemKindInfo[]>("get_all_item_kinds");
    },
    async loadItem(id, kind, data, format) {
      await (await invoke())("load_item_bytes", {
        id,
        itemKind: kind,
        data: Array.from(data),
        format,
      });
    },
    async exportObject(name, format) {
      const arr = await (await invoke())<number[]>("export_object", { name, format });
      return new Uint8Array(arr);
    },
    async unloadObject(name) {
      await (await invoke())("unload_object", { name });
    },
    async loadArtifactBytes(id, kind, data, format) {
      await (await invoke())("load_artifact_bytes", {
        id,
        kind,
        data: Array.from(data),
        format,
      });
    },
    async listArtifacts() {
      return (await invoke())<ArtifactInfo[]>("list_artifacts");
    },
    async getArtifact(id) {
      return (await invoke())<unknown>("get_artifact", { id });
    },
    async unloadArtifact(id) {
      await (await invoke())("unload_artifact", { id });
    },
    async exportArtifact(id, format) {
      const arr = await (await invoke())<number[]>("export_artifact", { id, format });
      return new Uint8Array(arr);
    },
    async pickFiles(opts) {
      // Import lazily.
      const { open } = await import("@tauri-apps/plugin-dialog");
      const res = await open({ multiple: opts.multiple ?? false, filters: opts.filters });
      if (res == null) return null;
      return Array.isArray(res) ? res : [res];
    },
    async loadArtifactPath(id, kind, path) {
      await (await invoke())("load_artifact_path", { id, kind, path });
    },
    async loadItemPath(id, kind, path) {
      await (await invoke())("load_item_path", { id, itemKind: kind, path });
    },
    async getInitialFiles() {
      return (await invoke())<string[]>("get_initial_files");
    },
    async saveBytes(data, filename) {
      await (await invoke())("save_bytes", { data: Array.from(data), filename });
    },
    async registerListener<T>(event: string, listener: (data: T) => void) {
      // Import lazily.
      const { listen } = await import("@tauri-apps/api/event");
      return listen<T>(event, (e) => listener(e.payload));
    },
  };
}
