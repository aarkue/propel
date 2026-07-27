import type { ProjectPipelines } from "../pipeline/components/pipeline/editor/types";
import type { Manifest } from "./manifest";

/** A `.propel` file: version tag, data manifest (idb roots inlined as base64 gzipped bytes), and workspace localStorage (panel layout). */
interface ProjectFile {
  propel: 1;
  manifest: Manifest;
  workspace?: Record<string, string>;
  pipelines?: ProjectPipelines;
}

/** A parsed `.propel`: the data manifest, the captured workspace localStorage entries, and the
 *  project's pipelines (empty library when the file predates project-scoped pipelines). */
export interface ParsedProject {
  manifest: Manifest;
  workspace: Record<string, string>;
  pipelines: ProjectPipelines;
}

function toB64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]));
  }
  return btoa(parts.join(""));
}

export function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Serialize a session to a `.propel` byte payload; idb roots are inlined via `bytesOf`, `path` refs (Tauri) are left as-is. */
export async function serializeProject(
  manifest: Manifest,
  bytesOf: (key: string) => Promise<Uint8Array | undefined>,
  workspace?: Record<string, string>,
  pipelines?: ProjectPipelines,
): Promise<Uint8Array> {
  const roots = await Promise.all(
    manifest.roots.map(async (r) => {
      if (r.ref.kind !== "idb") return r;
      const bytes = await bytesOf(r.ref.key);
      if (!bytes) return { ...r, ref: { kind: "absent" as const } };
      return { ...r, ref: { kind: "inline" as const, format: r.format, bytesB64: toB64(bytes) } };
    }),
  );
  const file: ProjectFile = { propel: 1, manifest: { ...manifest, roots }, workspace, pipelines };
  return new TextEncoder().encode(JSON.stringify(file));
}

/** Parse a `.propel` payload, rejecting anything that is not a v1 project file. */
export function parseProject(data: Uint8Array): ParsedProject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(data));
  } catch {
    throw new Error("Not a valid .propel project file (bad JSON).");
  }
  const file = parsed as Partial<ProjectFile>;
  if (file.propel !== 1 || !file.manifest) {
    throw new Error("Not a valid .propel project file (unknown format).");
  }
  return {
    manifest: file.manifest,
    workspace: file.workspace ?? {},
    pipelines: file.pipelines ?? { saved: [] },
  };
}
