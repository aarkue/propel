import { Button, Select } from "@r4pm/components/ui";
import { Handle, type Node, type NodeProps, Position, useReactFlow } from "@xyflow/react";
import { useContext, useRef } from "react";
import toast from "react-hot-toast";
import { TbFileImport } from "react-icons/tb";
import { BackendContext } from "../../BackendContext";
import { NodeWrapper } from "./NodeWrapper";
import { getTypeColor } from "./utils";

/** Importable artifact kinds offered by the file-import node. Kept local so the pipeline package
 *  stays decoupled from the studio's `io-kinds`. Mirrors that list (PetriNet/PNML is the first). */
export const FILE_IMPORT_KINDS = [
  {
    kind: "PetriNet",
    returnType: "PetriNet",
    formats: [{ extension: "pnml", mime: "text/plain" }],
  },
] as const;

export type FileImportNodeData = {
  kind: string;
  value?: unknown;
  returnType?: string;
  label?: string;
  executionStatus?: {
    status: "idle" | "running" | "success" | "error";
    error?: string;
  };
  output?: unknown;
};

export type FileImportNode = Node<FileImportNodeData, "fileImport">;

export function FileImportNode({ id, data, selected }: NodeProps<FileImportNode>) {
  const { updateNodeData } = useReactFlow();
  const backend = useContext(BackendContext);
  const inputRef = useRef<HTMLInputElement>(null);

  const kind = FILE_IMPORT_KINDS.find((k) => k.kind === data.kind) ?? FILE_IMPORT_KINDS[0];
  const color = getTypeColor({ "x-registry-ref": kind.returnType });
  // Stable per-node artifact id so re-importing overwrites this node's prior value.
  const artifactId = `fileimport-${id}`;

  const afterLoad = async (label: string) => {
    const value = await backend.getArtifact(artifactId);
    updateNodeData(id, { value, returnType: kind.returnType, label });
  };

  const pick = async () => {
    try {
      if (backend.pickFiles && backend.loadArtifactPath) {
        const exts = kind.formats.map((f) => f.extension);
        const paths = await backend.pickFiles({ filters: [{ name: kind.kind, extensions: [...exts] }] });
        const path = paths?.[0];
        if (!path) return;
        await backend.loadArtifactPath(artifactId, kind.kind, path);
        await afterLoad(path.split(/[\\/]/).pop() ?? path);
      } else {
        inputRef.current?.click();
      }
    } catch (e) {
      toast.error(`Import failed: ${String(e)}`);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ext = file.name.split(".").pop() ?? kind.formats[0].extension;
      await backend.loadArtifactBytes(artifactId, kind.kind, bytes, ext);
      await afterLoad(file.name);
    } catch (e) {
      toast.error(`Import failed: ${String(e)}`);
    }
  };

  return (
    <NodeWrapper
      selected={selected}
      executionStatus={data.executionStatus}
      title="Import File"
      subtitle={data.label ?? kind.returnType}
      icon={TbFileImport}
      minWidth="min-w-48"
      contentClassName="p-3 flex flex-col gap-2"
      handles={
        <div className="absolute h-full -right-1.5 top-0 flex flex-col justify-center">
          <Handle
            type="source"
            id="output"
            position={Position.Right}
            className="relative! top-0! transform-none! w-3! h-3! border-2! border-white! transition-transform hover:scale-125"
            style={{ backgroundColor: color }}
          >
            <div className="hidden group-hover:block absolute top-1/2 -translate-y-1/2 left-4 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none shadow-sm border border-gray-700">
              <span className="font-semibold">{kind.returnType}</span>
            </div>
          </Handle>
        </div>
      }
    >
      <Select.Root value={kind.kind} onValueChange={(v) => updateNodeData(id, { kind: v })} size="1">
        <Select.Trigger variant="soft" className="w-full" />
        <Select.Content>
          {FILE_IMPORT_KINDS.map((k) => (
            <Select.Item key={k.kind} value={k.kind}>
              {k.kind}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
      <Button size="1" variant="soft" onClick={pick} className="w-full">
        {data.label ? "Replace file..." : "Import file..."}
      </Button>
      {data.label && <div className="text-[10px] text-gray-500 font-mono truncate">{data.label}</div>}
      <input
        ref={inputRef}
        type="file"
        accept={kind.formats.map((f) => `.${f.extension}`).join(",")}
        style={{ display: "none" }}
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </NodeWrapper>
  );
}
