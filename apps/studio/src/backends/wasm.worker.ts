import init, {
  execute_binding,
  export_artifact,
  export_object,
  get_all_item_kinds,
  get_all_objects_with_type,
  get_artifact,
  list_artifacts,
  list_functions,
  load_artifact_bytes,
  load_item_bytes,
  set_object_label,
  unload_artifact,
  unload_object,
} from "@propel-engine/backend_wasm.js";
import wasmUrl from "@propel-engine/backend_wasm_bg.wasm?url";

/**
 * Worker side of the in-process wasm backend.
 * The main thread (wasm.ts) talks to this worker over a small request/response protocol:
 * It sends `{id, method, args}`, the worker replies with `{id, result}` or `{id, error}`.
 * Engine-emitted events are pushed as `{type:"event"}`.
 */

// Events (e.g., import process)
(globalThis as { wasmSpace?: unknown }).wasmSpace = {
  emit: (name: string, data: unknown) => self.postMessage({ type: "event", name, data }),
};

const ready = init({ url: wasmUrl }).then(() => undefined);

self.onmessage = async (e: MessageEvent<{ id: number; method: string; args: any[] }>) => {
  const { id, method, args } = e.data;
  try {
    await ready;
    let result: unknown;
    let transfer: Transferable[] = [];
    switch (method) {
      case "ready":
        break;
      case "callBinding":
        // Parse the JSON-encoded result here so the (potentially large) decode+parse cost
        // also stays off the main thread; the plain object is structured-cloned back.
        result = JSON.parse(new TextDecoder().decode(execute_binding(args[0], args[1], args[2])));
        break;
      case "listObjects":
        result = get_all_objects_with_type();
        break;
      case "listFunctions":
        result = list_functions();
        break;
      case "listItemKinds":
        result = get_all_item_kinds();
        break;
      case "loadItem":
        load_item_bytes(args[0], args[1], args[2], args[3]);
        break;
      case "exportObject": {
        const bytes = export_object(args[0], args[1]) as Uint8Array;
        result = bytes;
        transfer = [bytes.buffer];
        break;
      }
      case "unloadObject":
        try {
          unload_object(args[0]);
        } catch {
          // already-unloaded / unknown id: nothing to do.
        }
        break;
      case "setLabel":
        set_object_label(args[0], args[1]);
        break;
      case "loadArtifactBytes":
        load_artifact_bytes(args[0], args[1], args[2], args[3]);
        break;
      case "listArtifacts":
        result = list_artifacts();
        break;
      case "getArtifact":
        result = get_artifact(args[0]);
        break;
      case "unloadArtifact":
        try {
          unload_artifact(args[0]);
        } catch {
          // already-unloaded / unknown id: nothing to do.
        }
        break;
      case "exportArtifact": {
        const bytes = export_artifact(args[0], args[1]) as Uint8Array;
        result = bytes;
        transfer = [bytes.buffer];
        break;
      }
      default:
        throw new Error(`unknown method: ${method}`);
    }
    self.postMessage({ id, result }, { transfer });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
