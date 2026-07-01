import { DropdownMenu, ScrollArea } from "@r4pm/components/ui";
import { FaClone, FaCopy, FaPaste, FaTrash } from "react-icons/fa";
import { RxMagnifyingGlass } from "react-icons/rx";
import type { AppNode } from "./types";
import type { Edge } from "@xyflow/react";
import toast from "react-hot-toast";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ExtendedJSONSchema, FunctionMeta } from "../../../BackendContext";

interface PipelineContextMenuProps {
  contextMenu: {
    mouseX: number;
    mouseY: number;
    type: "node" | "edge" | "pane";
    id?: string;
  } | null;
  setContextMenu: (
    menu: { mouseX: number; mouseY: number; type: "node" | "edge" | "pane"; id?: string } | null,
  ) => void;
  nodes: AppNode[];
  setNodes: React.Dispatch<React.SetStateAction<AppNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  clipboard: { nodes: AppNode[]; edges: Edge[] } | null;
  setClipboard: (clipboard: { nodes: AppNode[]; edges: Edge[] } | null) => void;
  handlePaste: () => void;
  addNode: (type: string, dataId: string, position: { x: number; y: number }) => void;
  availableObjectsQuery: UseQueryResult<string[], Error>;
  structDefinitions: Record<string, ExtendedJSONSchema>;
  enumDefinitions?: Record<string, ExtendedJSONSchema>;
  tupleDefinitions?: Record<string, ExtendedJSONSchema>;
  functionMetaQuery: UseQueryResult<FunctionMeta[], Error>;
  screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number };
}

export function PipelineContextMenu({
  contextMenu,
  setContextMenu,
  nodes,
  setNodes,
  setEdges,
  clipboard,
  setClipboard,
  handlePaste,
  addNode,
  availableObjectsQuery,
  structDefinitions,
  enumDefinitions,
  tupleDefinitions,
  functionMetaQuery,
  screenToFlowPosition,
}: PipelineContextMenuProps) {
  if (!contextMenu) return null;

  return (
    <DropdownMenu.Root open={!!contextMenu} onOpenChange={(open) => !open && setContextMenu(null)}>
      <DropdownMenu.Trigger>
        <div
          style={{
            position: "fixed",
            top: contextMenu.mouseY,
            left: contextMenu.mouseX,
            width: 0,
            height: 0,
          }}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        {contextMenu.type === "node" && (
          <>
            <DropdownMenu.Item
              onSelect={() => {
                const node = nodes.find((n) => n.id === contextMenu.id);
                if (node) {
                  const newId = `${node.type}-${crypto.randomUUID()}`;
                  const newNode = {
                    ...node,
                    id: newId,
                    position: { x: node.position.x + 20, y: node.position.y + 20 },
                    selected: true,
                    data: { ...node.data },
                  } as AppNode;
                  setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), newNode]);
                }
              }}
            >
              <FaClone className="mr-2" /> Duplicate
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() => {
                const node = nodes.find((n) => n.id === contextMenu.id);
                if (node) {
                  setClipboard({ nodes: [node], edges: [] });
                  toast.success("Copied to clipboard");
                }
              }}
            >
              <FaCopy className="mr-2" /> Copy
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item
              color="red"
              onSelect={() => {
                const nodeId = contextMenu.id;
                if (!nodeId) return;

                // Check if the node is part of a selection
                const node = nodes.find((n) => n.id === nodeId);
                const isSelected = node?.selected;

                if (isSelected) {
                  // Delete all selected nodes
                  setNodes((nds) => nds.filter((n) => !n.selected));
                  setEdges((eds) =>
                    eds.filter((e) => {
                      const sourceNode = nodes.find((n) => n.id === e.source);
                      const targetNode = nodes.find((n) => n.id === e.target);
                      return !sourceNode?.selected && !targetNode?.selected;
                    }),
                  );
                } else {
                  // Delete just this node
                  setNodes((nds) => nds.filter((n) => n.id !== nodeId));
                  setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
                }
              }}
            >
              <FaTrash className="mr-2" /> Delete
            </DropdownMenu.Item>
          </>
        )}
        {contextMenu.type === "edge" && (
          <DropdownMenu.Item
            color="red"
            onSelect={() => {
              setEdges((eds) => eds.filter((e) => e.id !== contextMenu.id));
            }}
          >
            <FaTrash className="mr-2" /> Delete Connection
          </DropdownMenu.Item>
        )}
        {contextMenu.type === "pane" && (
          <>
            <DropdownMenu.Item disabled={!clipboard} onSelect={handlePaste}>
              <FaPaste className="mr-2" /> Paste
            </DropdownMenu.Item>
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger>
                <RxMagnifyingGlass className="mr-2" /> Add Node
              </DropdownMenu.SubTrigger>
              <DropdownMenu.SubContent>
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger>Basic Inputs</DropdownMenu.SubTrigger>
                  <DropdownMenu.SubContent>
                    {["string", "integer", "number", "boolean"].map((type) => (
                      <DropdownMenu.Item
                        key={type}
                        onSelect={() => {
                          const pos = screenToFlowPosition({ x: contextMenu.mouseX, y: contextMenu.mouseY });
                          addNode("primitive", type, pos);
                        }}
                      >
                        {type}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Sub>

                {availableObjectsQuery.data && availableObjectsQuery.data.length > 0 && (
                  <DropdownMenu.Sub>
                    <DropdownMenu.SubTrigger>Loaded Objects</DropdownMenu.SubTrigger>
                    <DropdownMenu.SubContent>
                      {availableObjectsQuery.data.map((type) => (
                        <DropdownMenu.Item
                          key={type}
                          onSelect={() => {
                            const pos = screenToFlowPosition({
                              x: contextMenu.mouseX,
                              y: contextMenu.mouseY,
                            });
                            addNode("object", type, pos);
                          }}
                        >
                          {type}
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Sub>
                )}

                {Object.keys(structDefinitions).length > 0 && (
                  <DropdownMenu.Sub>
                    <DropdownMenu.SubTrigger>Structs</DropdownMenu.SubTrigger>
                    <DropdownMenu.SubContent>
                      {Object.keys(structDefinitions).map((name) => (
                        <DropdownMenu.Item
                          key={name}
                          onSelect={() => {
                            const pos = screenToFlowPosition({
                              x: contextMenu.mouseX,
                              y: contextMenu.mouseY,
                            });
                            addNode("struct", name, pos);
                          }}
                        >
                          {name}
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Sub>
                )}

                {enumDefinitions && Object.keys(enumDefinitions).length > 0 && (
                  <DropdownMenu.Sub>
                    <DropdownMenu.SubTrigger>Enums</DropdownMenu.SubTrigger>
                    <DropdownMenu.SubContent>
                      {Object.keys(enumDefinitions).map((name) => (
                        <DropdownMenu.Item
                          key={name}
                          onSelect={() => {
                            const pos = screenToFlowPosition({
                              x: contextMenu.mouseX,
                              y: contextMenu.mouseY,
                            });
                            addNode("enum", name, pos);
                          }}
                        >
                          {name}
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Sub>
                )}

                {tupleDefinitions && Object.keys(tupleDefinitions).length > 0 && (
                  <DropdownMenu.Sub>
                    <DropdownMenu.SubTrigger>Tuples</DropdownMenu.SubTrigger>
                    <DropdownMenu.SubContent>
                      {Object.keys(tupleDefinitions).map((name) => (
                        <DropdownMenu.Item
                          key={name}
                          onSelect={() => {
                            const pos = screenToFlowPosition({
                              x: contextMenu.mouseX,
                              y: contextMenu.mouseY,
                            });
                            addNode("tuple", name, pos);
                          }}
                        >
                          {name}
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Sub>
                )}

                {functionMetaQuery.data && functionMetaQuery.data.length > 0 && (
                  <DropdownMenu.Sub>
                    <DropdownMenu.SubTrigger>Functions</DropdownMenu.SubTrigger>
                    <DropdownMenu.SubContent>
                      <ScrollArea style={{ maxHeight: "300px" }}>
                        {functionMetaQuery.data.map((func) => (
                          <DropdownMenu.Item
                            key={func.id}
                            onSelect={() => {
                              const pos = screenToFlowPosition({
                                x: contextMenu.mouseX,
                                y: contextMenu.mouseY,
                              });
                              addNode("function", func.id, pos);
                            }}
                          >
                            {func.name}
                          </DropdownMenu.Item>
                        ))}
                      </ScrollArea>
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Sub>
                )}

                <DropdownMenu.Separator />
                <DropdownMenu.Item
                  onSelect={() => {
                    const pos = screenToFlowPosition({ x: contextMenu.mouseX, y: contextMenu.mouseY });
                    addNode("jsonView", "jsonView", pos);
                  }}
                >
                  Output View
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Sub>
          </>
        )}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
