import {
  addEdge,
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type Edge,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useOnSelectionChange,
  type OnConnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./pipeline.css";
import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { layoutGraph } from "@r4pm/components";
import { layoutTransport } from "../../../backends";
import toast from "react-hot-toast";

import type { BackendContext as ClientBackend } from "@r4pm/client";
import type { ViewerRegistry } from "../../../viewers";
import {
  BackendContext,
  ViewerRegistryContext,
  OpenAsPanelContext,
  type CoreBackend,
  type ExtendedJSONSchema,
  type FunctionMeta,
  type OpenAsPanelFn,
} from "../../BackendContext";
import { FunctionNode } from "./FunctionNode";
import { ObjectNode } from "./ObjectNode";
import { PrimitiveNode } from "./PrimitiveNode";
import { StructNode } from "./StructNode";
import { ArrayNode } from "./ArrayNode";
import { ArtifactNode } from "./ArtifactNode";
import { FileImportNode } from "./FileImportNode";
import { ViewerOutputNode } from "./ViewerOutputNode";

import type { AppNode, SavedPipeline } from "./editor/types";
import { PipelineSidebar } from "./editor/PipelineSidebar";
import { PipelineRunPanel } from "./editor/PipelineRunPanel";
import { PipelineActionsPanel } from "./editor/PipelineActionsPanel";
import { PipelineContextMenu } from "./editor/PipelineContextMenu";
import { usePipelineFiltering } from "./editor/usePipelineFiltering";
import { usePipelineExecution } from "./editor/usePipelineExecution";
import { isCompatible } from "./utils";
import { getNodeType, outputNameFor } from "./editor/helpers";

const nodeTypes = {
  function: FunctionNode,
  object: ObjectNode,
  primitive: PrimitiveNode,
  struct: StructNode,
  jsonView: ViewerOutputNode,
  array: ArrayNode,
  artifact: ArtifactNode,
  fileImport: FileImportNode,
};

/** Drop volatile execution results before persisting a pipeline: `output`/`executionStatus` are
 *  per-run on every node, and a jsonView's `value`/`returnType`/`hasRun` are its rendered result.
 *  Primitive/struct/enum `value` is user INPUT, so it is kept. Prevents bloated / oversized saves. */
function stripRuntimeNodeData(n: AppNode): AppNode {
  const data = { ...n.data } as Record<string, unknown>;
  delete data.output;
  delete data.executionStatus;
  if (n.type === "jsonView") {
    delete data.value;
    delete data.returnType;
    delete data.hasRun;
  }
  return { ...n, data } as AppNode;
}

/** Persist pipelines, surfacing a full-storage error instead of throwing uncaught. */
function persistPipelines(saved: SavedPipeline[]): boolean {
  try {
    localStorage.setItem("r4pm-pipelines", JSON.stringify(saved));
    return true;
  } catch (e) {
    console.error("Failed to persist pipelines", e);
    toast.error("Could not save pipeline: browser storage is full. Delete old pipelines and retry.");
    return false;
  }
}

export interface PipelineEditorProps {
  backend: ClientBackend;
  viewerRegistry?: ViewerRegistry;
  /** Bridge: open a node's output as a standalone viewer panel in the host. */
  onOpenOutputAsPanel?: OpenAsPanelFn;
}

/** Imperative API for host-driven bridges (e.g. "send to pipeline"). */
export interface PipelineHandle {
  addObjectNode: (handle: { id: string; kind: string }) => void;
  addArtifactNode: (a: { value: unknown; returnType: string; label: string }) => void;
}

export const PipelineEditor = forwardRef<PipelineHandle, PipelineEditorProps>(function PipelineEditor(
  { backend, viewerRegistry, onOpenOutputAsPanel },
  ref,
) {
  const handleRef = useRef<PipelineHandle | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      addObjectNode: (h) => handleRef.current?.addObjectNode(h),
      addArtifactNode: (a) => handleRef.current?.addArtifactNode(a),
    }),
    [],
  );

  const adapted = useMemo<CoreBackend>(
    () => ({
      executeFunction: (functionID, args, opts) =>
        (backend.callBinding as (id: string, a: unknown, o?: { outputName?: string }) => Promise<unknown>)(
          functionID,
          args,
          opts,
        ),
      listFunctions: () => backend.listFunctions(),
      getObjectsWithType: async () =>
        (await backend.listObjects()).map((o) => [o.id, o.kind] as [string, string]),
      listItemKinds: () => backend.listItemKinds(),
      unloadObject: (id) => backend.unloadObject(id),
      downloadBinary: (binary, filename) => {
        const blob = new Blob([binary]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      },
      getArtifact: (id) => backend.getArtifact(id),
      loadArtifactBytes: (id, kind, data, format) => backend.loadArtifactBytes(id, kind, data, format),
      loadArtifactPath: backend.loadArtifactPath
        ? (id, kind, path) => backend.loadArtifactPath!(id, kind, path)
        : undefined,
      pickFiles: backend.pickFiles ? (opts) => backend.pickFiles!(opts) : undefined,
    }),
    [backend],
  );

  return (
    <BackendContext.Provider value={adapted}>
      <ViewerRegistryContext.Provider value={viewerRegistry}>
        <OpenAsPanelContext.Provider value={onOpenOutputAsPanel}>
          <ReactFlowProvider>
            <PipelineEditorContent
              registerHandle={(h) => {
                handleRef.current = h;
              }}
            />
          </ReactFlowProvider>
        </OpenAsPanelContext.Provider>
      </ViewerRegistryContext.Provider>
    </BackendContext.Provider>
  );
});

function PipelineEditorContent({ registerHandle }: { registerHandle: (h: PipelineHandle) => void }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([] as Edge[]);
  const { screenToFlowPosition, fitView } = useReactFlow();

  const [pipelineName, setPipelineName] = useState("");
  const [currentPipelineName, setCurrentPipelineName] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllNodes, setShowAllNodes] = useState(false);
  const [selectedNode, setSelectedNode] = useState<AppNode | null>(null);
  const [savedPipelines, setSavedPipelines] = useState<SavedPipeline[]>([]);
  const [clipboard, setClipboard] = useState<{ nodes: AppNode[]; edges: Edge[] } | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    type: "node" | "edge" | "pane";
    id?: string;
  } | null>(null);

  const backend = useContext(BackendContext);
  // Stable per-editor id (deterministic across re-renders, unique per pipeline panel) used to
  // namespace this pipeline's intermediate result handles.
  const pipelineId = useId();

  useOnSelectionChange({
    onChange: ({ nodes }) => {
      if (nodes.length === 1) {
        setSelectedNode(nodes[0] as AppNode);
        setShowAllNodes(false);
      } else {
        setSelectedNode(null);
        setShowAllNodes(false);
      }
    },
  });

  const {
    filteredFunctions,
    filteredStructs,
    filteredEnums,
    filteredTuples,
    filteredObjects,
    filteredPrimitives,
    availableObjectsQuery,
    functionMetaQuery,
    structDefinitions,
    enumDefinitions,
    tupleDefinitions,
    convertible,
  } = usePipelineFiltering(backend, searchQuery, selectedNode, showAllNodes);

  const { isRunning, runPipeline } = usePipelineExecution(backend, nodes, edges, setNodes, pipelineId);

  // GC a function node's deterministic intermediate (the engine also evicts its cached conversions)
  // when the node leaves the graph, so deleted/cleared nodes don't leak hidden result objects.
  const gcNodeOutput = useCallback(
    (nodeId: string) => {
      void backend.unloadObject(outputNameFor(pipelineId, nodeId));
    },
    [backend, pipelineId],
  );
  const onNodesDelete = useCallback(
    (deleted: AppNode[]) => {
      for (const n of deleted) if (n.type === "function") gcNodeOutput(n.id);
    },
    [gcNodeOutput],
  );

  // Host bridge: add a loaded-object input node from an external handle.
  const addObjectNode = useCallback(
    (handle: { id: string; kind: string }) => {
      const position = screenToFlowPosition
        ? screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
        : { x: 100, y: 100 };
      const newNode: AppNode = {
        id: `object-${handle.kind}-${crypto.randomUUID()}`,
        type: "object",
        position,
        data: { type: handle.kind, selectedObject: handle.id },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [screenToFlowPosition, setNodes],
  );

  const addArtifactNode = useCallback(
    (a: { value: unknown; returnType: string; label: string }) => {
      const position = screenToFlowPosition
        ? screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
        : { x: 100, y: 100 };
      const newNode: AppNode = {
        id: `artifact-${a.returnType}-${crypto.randomUUID()}`,
        type: "artifact",
        position,
        data: { value: a.value, returnType: a.returnType, label: a.label },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [screenToFlowPosition, setNodes],
  );

  useEffect(() => {
    registerHandle({ addObjectNode, addArtifactNode });
  }, [registerHandle, addObjectNode, addArtifactNode]);

  // Load saved pipelines
  useEffect(() => {
    const saved = localStorage.getItem("r4pm-pipelines");
    if (saved) {
      try {
        setSavedPipelines(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load pipelines", e);
      }
    }
  }, []);

  const savePipeline = useCallback(
    (name: string) => {
      if (!name) return;
      const newPipeline: SavedPipeline = {
        name,
        nodes: nodes.map(stripRuntimeNodeData),
        edges,
        createdAt: Date.now(),
      };
      const newSaved = [...savedPipelines.filter((p) => p.name !== name), newPipeline];
      setSavedPipelines(newSaved);
      if (!persistPipelines(newSaved)) return;
      toast.success(`Pipeline "${name}" saved`);
      setPipelineName("");
      setCurrentPipelineName(name);
    },
    [nodes, edges, savedPipelines],
  );

  const deletePipeline = useCallback(
    (name: string) => {
      const newSaved = savedPipelines.filter((p) => p.name !== name);
      setSavedPipelines(newSaved);
      persistPipelines(newSaved);
      toast.success(`Pipeline "${name}" deleted`);
      if (currentPipelineName === name) {
        setCurrentPipelineName(null);
      }
    },
    [savedPipelines, currentPipelineName],
  );

  const loadPipeline = useCallback(
    (pipeline: SavedPipeline) => {
      setNodes(pipeline.nodes);
      setEdges(pipeline.edges);
      toast.success(`Pipeline "${pipeline.name}" loaded`);
      setCurrentPipelineName(pipeline.name);
    },
    [setNodes, setEdges],
  );

  const addNode = useCallback(
    (type: string, dataId: string, position: { x: number; y: number }) => {
      let newNode: AppNode | undefined;

      if (type === "function") {
        const func = functionMetaQuery.data?.find((f: FunctionMeta) => f.id === dataId);
        if (!func) return;
        newNode = {
          id: `${type}-${dataId}-${crypto.randomUUID()}`,
          type: "function",
          position,
          data: { functionMeta: func },
        };
      } else if (type === "object") {
        newNode = {
          id: `${type}-${dataId}-${crypto.randomUUID()}`,
          type: "object",
          position,
          data: { type: dataId, selectedObject: undefined },
        };
      } else if (type === "primitive") {
        newNode = {
          id: `${type}-${dataId}-${crypto.randomUUID()}`,
          type: "primitive",
          position,
          data: { type: dataId as any, value: dataId === "boolean" ? false : undefined },
        };
      } else if (type === "struct") {
        const schema = structDefinitions[dataId];
        if (!schema) return;
        newNode = {
          id: `${type}-${dataId}-${crypto.randomUUID()}`,
          type: "struct",
          position,
          data: { name: dataId, schema },
        };
      } else if (type === "enum") {
        const schema = enumDefinitions[dataId];
        if (!schema) return;
        newNode = {
          id: `${type}-${dataId}-${crypto.randomUUID()}`,
          type: "struct", // Reuse StructNode for Enums
          position,
          data: { name: dataId, schema },
        };
      } else if (type === "tuple") {
        const schema = tupleDefinitions[dataId];
        if (!schema) return;
        // Convert prefixItems to properties for StructNode compatibility
        const properties: Record<string, ExtendedJSONSchema> = {};
        if (schema.prefixItems) {
          schema.prefixItems.forEach((item, i) => {
            properties[String(i)] = item;
          });
        }
        const tupleSchema = { ...schema, properties };

        newNode = {
          id: `${type}-${dataId}-${crypto.randomUUID()}`,
          type: "struct", // Reuse StructNode for Tuples
          position,
          data: { name: dataId, schema: tupleSchema },
        };
      } else if (type === "jsonView") {
        newNode = {
          id: `${type}-${crypto.randomUUID()}`,
          type: "jsonView",
          position,
          data: { value: undefined },
        };
      } else if (type === "array") {
        newNode = {
          id: `${type}-${crypto.randomUUID()}`,
          type: "array",
          position,
          data: { itemCount: 2 },
        };
      } else if (type === "fileImport") {
        newNode = {
          id: `${type}-${crypto.randomUUID()}`,
          type: "fileImport",
          position,
          data: { kind: "PetriNet" },
        };
      }

      if (newNode) {
        setNodes((nds) => [...nds, newNode!]);
      }
    },
    [functionMetaQuery.data, structDefinitions, enumDefinitions, tupleDefinitions, setNodes],
  );

  const onConnect: OnConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow");
      const dataId = event.dataTransfer.getData("application/dataId");

      if (typeof type === "undefined" || !type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addNode(type, dataId, position);
    },
    [screenToFlowPosition, addNode],
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);

      if (!sourceNode || !targetNode) return false;

      // Determine source type (reuses getNodeType so it stays exhaustive, incl. array sources).
      const sourceType = getNodeType(sourceNode);

      // Determine target type
      let targetType: ExtendedJSONSchema | undefined;
      if (targetNode.type === "function") {
        const funcMeta = targetNode.data.functionMeta;
        const arg = funcMeta.args.find(([name]) => name === connection.targetHandle);
        if (arg) targetType = arg[1];
      } else if (targetNode.type === "struct") {
        const schema = targetNode.data.schema;
        if (schema.properties && connection.targetHandle) {
          targetType = schema.properties[connection.targetHandle] as ExtendedJSONSchema;

          // Fallback for tuple items (handle id is "item-N", property key is "N")
          if (!targetType && connection.targetHandle.startsWith("item-")) {
            const index = connection.targetHandle.replace("item-", "");
            targetType = schema.properties[index] as ExtendedJSONSchema;
          }
        }
      } else if (targetNode.type === "jsonView") {
        return true;
      } else if (targetNode.type === "array") {
        // Array inputs accept any element type (element types are not checked).
        return true;
      }

      if (!sourceType || !targetType) return true;

      return isCompatible(sourceType, targetType, convertible);
    },
    [nodes, convertible],
  );

  const handleCopy = useCallback(() => {
    const selectedNodes = nodes.filter((n) => n.selected);
    if (selectedNodes.length === 0) return;

    const connectedEdges = edges.filter(
      (e) => selectedNodes.some((n) => n.id === e.source) && selectedNodes.some((n) => n.id === e.target),
    );

    setClipboard({ nodes: selectedNodes, edges: connectedEdges });
    toast.success("Copied to clipboard");
  }, [nodes, edges]);

  const handlePaste = useCallback(() => {
    if (!clipboard) return;

    const idMap = new Map<string, string>();
    const newNodes = clipboard.nodes.map((node) => {
      const newId = `${node.type}-${crypto.randomUUID()}`;
      idMap.set(node.id, newId);
      return {
        ...node,
        id: newId,
        position: { x: node.position.x + 50, y: node.position.y + 50 },
        selected: true,
        data: { ...node.data },
      } as AppNode;
    });

    const newEdges = clipboard.edges.map((edge) => ({
      ...edge,
      id: `e-${crypto.randomUUID()}`,
      source: idMap.get(edge.source)!,
      target: idMap.get(edge.target)!,
      selected: true,
    }));

    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes]);
    setEdges((eds) => [...eds.map((e) => ({ ...e, selected: false })), ...newEdges]);
    toast.success("Pasted");
  }, [clipboard, setNodes, setEdges]);

  const handleSelectAll = useCallback(() => {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
    setEdges((eds) => eds.map((e) => ({ ...e, selected: true })));
  }, [setNodes, setEdges]);

  const handleDuplicate = useCallback(() => {
    const selectedNodes = nodes.filter((n) => n.selected);
    if (selectedNodes.length === 0) return;

    const idMap = new Map<string, string>();
    const newNodes = selectedNodes.map((node) => {
      const newId = `${node.type}-${crypto.randomUUID()}`;
      idMap.set(node.id, newId);
      return {
        ...node,
        id: newId,
        position: { x: node.position.x + 20, y: node.position.y + 20 },
        selected: true,
        data: { ...node.data },
      } as AppNode;
    });

    const connectedEdges = edges.filter(
      (e) => selectedNodes.some((n) => n.id === e.source) && selectedNodes.some((n) => n.id === e.target),
    );

    const newEdges = connectedEdges.map((edge) => ({
      ...edge,
      id: `e-${crypto.randomUUID()}`,
      source: idMap.get(edge.source)!,
      target: idMap.get(edge.target)!,
      selected: true,
    }));

    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes]);
    setEdges((eds) => [...eds.map((e) => ({ ...e, selected: false })), ...newEdges]);
    toast.success("Duplicated");
  }, [nodes, edges, setNodes, setEdges]);

  const handleAutoLayout = useCallback(async () => {
    const sizeOf = (n: (typeof nodes)[number]) => ({
      width: n.measured?.width ?? 200,
      height: n.measured?.height ?? 100,
    });
    try {
      const laid = await layoutGraph(nodes, edges, {
        transport: layoutTransport,
        id: (n) => n.id,
        source: (e) => e.source,
        target: (e) => e.target,
        direction: "LR",
        flowEdges: true,
        nodeSpec: sizeOf,
      });
      // Rust returns node centers; React Flow positions are top-left.
      const newNodes = nodes.map((node) => {
        const c = laid.centerOf(node.id);
        const s = sizeOf(node);
        return { ...node, position: { x: c.x - s.width / 2, y: c.y - s.height / 2 } };
      });
      setNodes(newNodes);
      setTimeout(() => fitView({ padding: 0.2 }), 50);
      toast.success("Auto layout applied");
    } catch (e) {
      console.error("Layout failed", e);
      toast.error("Auto layout failed");
    }
  }, [nodes, edges, setNodes, fitView]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      )
        return;

      if ((e.metaKey || e.ctrlKey) && e.key === "c") {
        e.preventDefault();
        handleCopy();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "v") {
        e.preventDefault();
        handlePaste();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault();
        handleSelectAll();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        handleDuplicate();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (currentPipelineName) {
          savePipeline(currentPipelineName);
        } else {
          // Unnamed pipeline: open the Save dialog to name it.
          setPipelineName("");
          setSaveDialogOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCopy, handlePaste, handleSelectAll, handleDuplicate, currentPipelineName, savePipeline]);

  // Context Menu Handlers
  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: AppNode) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      mouseX: event.clientX,
      mouseY: event.clientY,
      type: "node",
      id: node.id,
    });
  }, []);

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      mouseX: event.clientX,
      mouseY: event.clientY,
      type: "edge",
      id: edge.id,
    });
  }, []);

  const onPaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    event.preventDefault();
    setContextMenu({
      mouseX: event.clientX,
      mouseY: event.clientY,
      type: "pane",
    });
  }, []);

  const onPaneClick = useCallback(() => setContextMenu(null), []);

  return (
    <div className="w-full h-full flex" ref={wrapperRef}>
      <PipelineSidebar
        currentPipelineName={currentPipelineName}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        showAllNodes={showAllNodes}
        setShowAllNodes={setShowAllNodes}
        selectedNode={selectedNode}
        filteredPrimitives={filteredPrimitives}
        filteredObjects={filteredObjects}
        filteredStructs={filteredStructs}
        filteredEnums={filteredEnums}
        filteredTuples={filteredTuples}
        filteredFunctions={filteredFunctions}
        availableObjectsLoading={availableObjectsQuery.isLoading}
        functionMetaLoading={functionMetaQuery.isLoading}
        savedPipelines={savedPipelines}
        loadPipeline={loadPipeline}
        setPipelineToDelete={deletePipeline}
      />

      <div
        className="flex-1 h-full relative"
        onDrop={onDrop}
        onDragOver={onDragOver}
        onContextMenu={onPaneContextMenu}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodesDelete={onNodesDelete}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          isValidConnection={isValidConnection}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeContextMenu={onEdgeContextMenu}
          onPaneContextMenu={onPaneContextMenu}
          onPaneClick={onPaneClick}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            style: { stroke: "#888", strokeWidth: 2 },
            animated: true,
          }}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
          <Controls />

          <PipelineRunPanel
            isRunning={isRunning}
            runPipeline={runPipeline}
            nodes={nodes}
            setNodes={setNodes}
          />

          <PipelineActionsPanel
            pipelineName={pipelineName}
            setPipelineName={setPipelineName}
            currentPipelineName={currentPipelineName}
            savePipeline={savePipeline}
            savedPipelines={savedPipelines}
            loadPipeline={loadPipeline}
            deletePipeline={deletePipeline}
            nodes={nodes}
            edges={edges}
            setNodes={setNodes}
            setEdges={setEdges}
            unloadOutput={gcNodeOutput}
            handleAutoLayout={handleAutoLayout}
            setCurrentPipelineName={setCurrentPipelineName}
            saveDialogOpen={saveDialogOpen}
            setSaveDialogOpen={setSaveDialogOpen}
          />
        </ReactFlow>
      </div>

      {contextMenu && (
        <PipelineContextMenu
          contextMenu={contextMenu}
          setContextMenu={setContextMenu}
          nodes={nodes}
          setNodes={setNodes}
          setEdges={setEdges}
          setClipboard={setClipboard}
          clipboard={clipboard}
          handlePaste={handlePaste}
          screenToFlowPosition={screenToFlowPosition}
          addNode={addNode}
          availableObjectsQuery={availableObjectsQuery}
          structDefinitions={structDefinitions}
          enumDefinitions={enumDefinitions}
          tupleDefinitions={tupleDefinitions}
          functionMetaQuery={functionMetaQuery}
        />
      )}
    </div>
  );
}
