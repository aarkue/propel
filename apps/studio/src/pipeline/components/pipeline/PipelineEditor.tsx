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
  type OnConnectEnd,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./pipeline.css";
import { forwardRef, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { layoutGraph } from "@r4pm/components";
import { vizTransport } from "../../../backends";
import { scheduleSessionSave } from "../../../persistence/session";
import { slimNode } from "../../pipeline-slim";
import { usePipelines } from "../../../stores/pipelines";
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
import { PresetNode } from "./PresetNode";
import { ViewerOutputNode } from "./ViewerOutputNode";

import type { AppNode, SavedPipeline } from "./editor/types";
import { PipelineSidebar } from "./editor/PipelineSidebar";
import { PipelineRunPanel } from "./editor/PipelineRunPanel";
import { PipelineActionsPanel } from "./editor/PipelineActionsPanel";
import { PipelineContextMenu } from "./editor/PipelineContextMenu";
import { usePipelineFiltering } from "./editor/usePipelineFiltering";
import { usePipelineExecution } from "./editor/usePipelineExecution";
import { pipelineLayoutRequest, placeNodes } from "./editor/auto-layout";
import { isCompatible } from "./utils";
import { getNodeType, outputNameFor } from "./editor/helpers";
import { inputNodeForArg } from "./editor/arg-input";
import { migratePipeline } from "../../migrate-pipeline";
import { quietImports } from "../../../shell/quiet-imports";
import { useThemeMode } from "../../../shell/theme-context";

/** Load a model file into a temporary registry item, read its JSON, and drop the item again. */
async function readModelValue(backend: ClientBackend, load: (id: string) => Promise<void>): Promise<unknown> {
  const id = `pipeline-model-${crypto.randomUUID()}`;
  quietImports.add(id);
  await load(id);
  try {
    return JSON.parse(new TextDecoder().decode(await backend.exportObject(id, "json")));
  } finally {
    await backend.unloadObject(id);
  }
}

/** The schema of input `handle` of `node`: a function argument, or a struct field or tuple item. */
function inputSchemaOf(node: AppNode, handle: string | null | undefined): ExtendedJSONSchema | undefined {
  if (!handle) return undefined;
  if (node.type === "function") return node.data.functionMeta.args.find(([name]) => name === handle)?.[1];
  if (node.type === "struct") {
    const props = node.data.schema.properties;
    if (!props) return undefined;
    // Tuple items have handle "item-N" and property key "N".
    return (props[handle] ?? props[handle.replace(/^item-/, "")]) as ExtendedJSONSchema | undefined;
  }
  return undefined;
}

const nodeTypes = {
  function: FunctionNode,
  object: ObjectNode,
  primitive: PrimitiveNode,
  struct: StructNode,
  jsonView: ViewerOutputNode,
  array: ArrayNode,
  artifact: ArtifactNode,
  fileImport: FileImportNode,
  preset: PresetNode,
};

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
  loadGraph: (nodes: AppNode[], edges: Edge[]) => void;
}

export const PipelineEditor = forwardRef<PipelineHandle, PipelineEditorProps>(function PipelineEditor(
  { backend, viewerRegistry, onOpenOutputAsPanel },
  ref,
) {
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
      downloadBinary: (binary, filename) => backend.saveBytes(new Uint8Array(binary), filename),
      readModel: (kind, data, format) =>
        readModelValue(backend, (id) => backend.loadItem(id, kind, data, format)),
      readModelPath: backend.loadItemPath
        ? (kind, path) => readModelValue(backend, (id) => backend.loadItemPath!(id, kind, path))
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
                if (typeof ref === "function") ref(h);
                else if (ref) ref.current = h;
              }}
            />
          </ReactFlowProvider>
        </OpenAsPanelContext.Provider>
      </ViewerRegistryContext.Provider>
    </BackendContext.Provider>
  );
});

function PipelineEditorContent({ registerHandle }: { registerHandle: (h: PipelineHandle | null) => void }) {
  const { resolved } = useThemeMode();
  const wrapperRef = useRef<HTMLDivElement>(null);
  // The editor starts from the saved draft. Graphs sent while the panel was closed apply on top.
  const [initialDraft] = useState(() => usePipelines.getState().draft);
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>(initialDraft?.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialDraft?.edges ?? []);
  const { screenToFlowPosition, fitView } = useReactFlow();

  const [pipelineName, setPipelineName] = useState("");
  const [currentPipelineName, setCurrentPipelineName] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllNodes, setShowAllNodes] = useState(false);
  const [selectedNode, setSelectedNode] = useState<AppNode | null>(null);
  const savedPipelines = usePipelines((s) => s.saved);
  const pipelinesLoadSeq = usePipelines((s) => s.loadSeq);
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

  // Steps hold the binding metadata from when they were added, and v0.4.1 ones the old names.
  useEffect(() => {
    const metas = functionMetaQuery.data;
    if (!metas) return;
    const migrated = migratePipeline(nodes, edges, metas);
    if (!migrated) return;
    setNodes(migrated.nodes);
    setEdges(migrated.edges);
  }, [functionMetaQuery.data, nodes, edges, setNodes, setEdges]);

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

  // Incoming positions can land off-viewport; fit view once React Flow has measured the new nodes.
  const loadGraph = useCallback(
    (newNodes: AppNode[], newEdges: Edge[]) => {
      setNodes(newNodes);
      setEdges(newEdges);
      setTimeout(() => fitView({ padding: 0.2 }), 50);
    },
    [setNodes, setEdges, fitView],
  );

  // Another project's draft replaces the graph. Not on mount, where it would drop the sends queued
  // while the panel was closed (and React's dev double-mount would run it again after them).
  // The draft is read via getState(), so autosaves do not re-run it.
  const loadedSeq = useRef(pipelinesLoadSeq);
  useEffect(() => {
    if (loadedSeq.current === pipelinesLoadSeq) return;
    loadedSeq.current = pipelinesLoadSeq;
    const draft = usePipelines.getState().draft;
    setNodes(draft?.nodes ?? []);
    setEdges(draft?.edges ?? []);
  }, [pipelinesLoadSeq, setNodes, setEdges]);

  useEffect(() => {
    registerHandle({ addObjectNode, addArtifactNode, loadGraph });
    return () => registerHandle(null);
  }, [registerHandle, addObjectNode, addArtifactNode, loadGraph]);

  // Selection/executionStatus churn changes node identity but not the slimmed draft; skip no-op saves.
  const lastSavedDraftRef = useRef<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      const slim = JSON.stringify({ nodes: nodes.map(slimNode), edges });
      if (slim === lastSavedDraftRef.current) return;
      lastSavedDraftRef.current = slim;
      usePipelines.getState().setDraft(nodes, edges);
      scheduleSessionSave(); // pipelines are frontend-only; no engine event would otherwise persist them
    }, 700);
    return () => clearTimeout(timer);
  }, [nodes, edges]);

  const savePipeline = useCallback(
    (name: string) => {
      if (!name) return;
      usePipelines.getState().savePipeline(name, nodes, edges);
      scheduleSessionSave();
      toast.success(`Pipeline "${name}" saved`);
      setPipelineName("");
      setCurrentPipelineName(name);
    },
    [nodes, edges],
  );

  const deletePipeline = useCallback(
    (name: string) => {
      usePipelines.getState().deletePipeline(name);
      scheduleSessionSave();
      toast.success(`Pipeline "${name}" deleted`);
      if (currentPipelineName === name) {
        setCurrentPipelineName(null);
      }
    },
    [currentPipelineName],
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
          data: { kind: "AcceptingPetriNet" },
        };
      }

      if (newNode) {
        setNodes((nds) => [...nds, newNode!]);
      }
    },
    [functionMetaQuery.data, structDefinitions, enumDefinitions, tupleDefinitions, setNodes],
  );

  const onConnect: OnConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  // A drag from an open input released on the canvas creates a node that feeds it, starting at
  // the argument's default.
  const onConnectEnd: OnConnectEnd = useCallback(
    (event, state) => {
      const { fromNode, fromHandle } = state;
      if (state.isValid || !fromNode || fromHandle?.type !== "target" || !fromHandle.id) return;
      if (!(event.target as Element | null)?.classList?.contains("react-flow__pane")) return;
      const handle = fromHandle.id;
      const schema = inputSchemaOf(fromNode as AppNode, handle);
      if (!schema) return;
      const point = "changedTouches" in event ? event.changedTouches[0] : event;
      const at = screenToFlowPosition({ x: point.clientX, y: point.clientY });
      const id = `input-${crypto.randomUUID()}`;
      const node = inputNodeForArg(schema, handle, { x: at.x - 200, y: at.y - 24 }, id);
      setNodes((nds) => [...nds, node]);
      setEdges((eds) =>
        addEdge({ source: id, sourceHandle: "output", target: fromNode.id, targetHandle: handle }, eds),
      );
    },
    [screenToFlowPosition, setNodes, setEdges],
  );

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

      // Array inputs accept any element type (element types are not checked).
      if (targetNode.type === "jsonView" || targetNode.type === "array") return true;
      const targetType = inputSchemaOf(targetNode, connection.targetHandle);

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
    try {
      const layout = await layoutGraph(vizTransport, pipelineLayoutRequest(nodes, edges));
      setNodes(placeNodes(nodes, layout));
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
          colorMode={resolved}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodesDelete={onNodesDelete}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
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
