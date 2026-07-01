import {
  Button,
  Card,
  Flex,
  Heading,
  IconButton,
  ScrollArea,
  Spinner,
  Text,
  TextField,
  Tooltip,
} from "@r4pm/components/ui";
import { RxInput, RxMagnifyingGlass } from "react-icons/rx";
import { TbBraces, TbDatabase, TbFunction, TbList, TbListNumbers, TbSelect } from "react-icons/tb";
import { FaFolderOpen, FaSave, FaTrash } from "react-icons/fa";
import type { IconType } from "react-icons";
import { memo } from "react";
import SimpleMarkdown from "../../../utils/SimpleMarkdown";
import type { AppNode, SavedPipeline } from "./types";
import type { ExtendedJSONSchema, FunctionMeta } from "../../../BackendContext";
import { getTypeColor } from "../utils";

interface PipelineSidebarProps {
  currentPipelineName: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedNode: AppNode | null;
  showAllNodes: boolean;
  setShowAllNodes: (show: boolean) => void;
  filteredPrimitives: string[];
  filteredObjects: string[];
  filteredStructs: [string, ExtendedJSONSchema][];
  filteredEnums: [string, ExtendedJSONSchema][];
  filteredTuples: [string, ExtendedJSONSchema][];
  filteredFunctions: FunctionMeta[];
  availableObjectsLoading: boolean;
  functionMetaLoading: boolean;
  savedPipelines: SavedPipeline[];
  loadPipeline: (pipeline: SavedPipeline) => void;
  setPipelineToDelete: (name: string) => void;
}

/** A draggable palette entry: type-colored dot + label, styled like the app's panel cards. */
function DraggableChip({
  label,
  color,
  dragType,
  dataId,
  title,
  trailing,
}: {
  label: string;
  color: string;
  dragType: string;
  dataId?: string;
  title?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div
      draggable
      title={title ?? label}
      onDragStart={(event) => {
        event.dataTransfer.setData("application/reactflow", dragType);
        if (dataId !== undefined) event.dataTransfer.setData("application/dataId", dataId);
        event.dataTransfer.effectAllowed = "move";
      }}
      className="group flex items-center gap-2 px-2 py-1.5 rounded-md border border-[var(--gray-a5)] bg-[var(--color-panel-solid)] cursor-grab text-xs text-[var(--gray-12)] transition-colors hover:border-[var(--indigo-8)] hover:bg-[var(--indigo-a2)]"
    >
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="flex-1 truncate">{label}</span>
      {trailing}
    </div>
  );
}

/** Muted, uppercase section header with an icon, matching the app's section styling. */
function SectionHeader({ label, icon: Icon }: { label: string; icon: IconType }) {
  return (
    <Text
      size="1"
      weight="medium"
      className="flex items-center gap-1.5 uppercase tracking-wide text-[var(--gray-10)]"
    >
      <Icon className="size-3" />
      {label}
    </Text>
  );
}

function PipelineSidebarImpl({
  currentPipelineName,
  searchQuery,
  setSearchQuery,
  selectedNode,
  showAllNodes,
  setShowAllNodes,
  filteredPrimitives,
  filteredObjects,
  filteredStructs,
  filteredEnums,
  filteredTuples,
  filteredFunctions,
  availableObjectsLoading,
  functionMetaLoading,
  savedPipelines,
  loadPipeline,
  setPipelineToDelete,
}: PipelineSidebarProps) {
  return (
    <div className="w-64 shrink-0 border-r border-[var(--gray-a5)] bg-[var(--gray-2)] flex-col overflow-hidden hidden lg:flex">
      <div className="p-3 border-b border-[var(--gray-a5)] bg-[var(--color-panel-solid)] flex flex-col gap-2.5">
        <div>
          <Heading size="2">Pipeline Editor</Heading>
          {currentPipelineName ? (
            <Text size="1" color="indigo" weight="bold" className="truncate block">
              {currentPipelineName}
            </Text>
          ) : (
            <Text size="1" color="gray">
              Drag nodes onto the canvas
            </Text>
          )}
        </div>

        <TextField.Root
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        >
          <TextField.Slot>
            <RxMagnifyingGlass height="16" width="16" />
          </TextField.Slot>
        </TextField.Root>

        <Flex align="center" gap="2">
          {selectedNode && (
            <Button
              size="1"
              variant={showAllNodes ? "soft" : "solid"}
              color="indigo"
              onClick={() => setShowAllNodes(!showAllNodes)}
            >
              {showAllNodes ? "Show all" : "Connectable only"}
            </Button>
          )}
          <Text size="1" color="gray">
            {selectedNode
              ? showAllNodes
                ? "Showing all nodes"
                : "Showing connectable nodes"
              : "Select a node to filter"}
          </Text>
        </Flex>
      </div>

      <ScrollArea className="flex-1 px-2 py-3">
        <div className="flex flex-col gap-4">
          {/* Primitives */}
          {filteredPrimitives.length > 0 && (
            <div className="flex flex-col gap-2">
              <SectionHeader label="Basic Inputs" icon={RxInput} />
              <div className="grid grid-cols-2 gap-1.5">
                {filteredPrimitives.map((type) => (
                  <DraggableChip
                    key={type}
                    label={type}
                    color={getTypeColor({ type })}
                    dragType="primitive"
                    dataId={type}
                  />
                ))}
                <DraggableChip
                  label="Array"
                  color={getTypeColor({ type: "array" })}
                  dragType="array"
                  trailing={<TbList className="text-[var(--gray-9)]" />}
                />
              </div>
            </div>
          )}

          {/* Loaded Objects */}
          {filteredObjects.length > 0 && (
            <div className="flex flex-col gap-2">
              <SectionHeader label="Loaded Objects" icon={TbDatabase} />
              {availableObjectsLoading ? (
                <div className="flex justify-center py-2">
                  <Spinner />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  {filteredObjects.map((type) => (
                    <DraggableChip
                      key={type}
                      label={type}
                      color={getTypeColor({ type: "string", "x-registry-ref": type })}
                      dragType="object"
                      dataId={type}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Structs */}
          {filteredStructs.length > 0 && (
            <div className="flex flex-col gap-2">
              <SectionHeader label="Structs" icon={TbBraces} />
              <div className="grid grid-cols-2 gap-1.5">
                {filteredStructs.map(([name, schema]) => (
                  <DraggableChip
                    key={name}
                    label={name}
                    color={getTypeColor(schema)}
                    dragType="struct"
                    dataId={name}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Enums */}
          {filteredEnums.length > 0 && (
            <div className="flex flex-col gap-2">
              <SectionHeader label="Enums" icon={TbSelect} />
              <div className="grid grid-cols-2 gap-1.5">
                {filteredEnums.map(([name, schema]) => (
                  <DraggableChip
                    key={name}
                    label={name}
                    color={getTypeColor(schema)}
                    dragType="enum"
                    dataId={name}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Tuples */}
          {filteredTuples.length > 0 && (
            <div className="flex flex-col gap-2">
              <SectionHeader label="Tuples" icon={TbListNumbers} />
              <div className="grid grid-cols-2 gap-1.5">
                {filteredTuples.map(([name, schema]) => (
                  <DraggableChip
                    key={name}
                    label={name}
                    color={getTypeColor(schema)}
                    dragType="tuple"
                    dataId={name}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Functions */}
          {filteredFunctions.length > 0 && (
            <div className="flex flex-col gap-2">
              <SectionHeader label="Functions" icon={TbFunction} />
              {functionMetaLoading ? (
                <div className="flex justify-center py-2">
                  <Spinner />
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {filteredFunctions.map((func) => (
                    <div
                      key={func.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("application/reactflow", "function");
                        event.dataTransfer.setData("application/dataId", func.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      className="group flex gap-2 px-2 py-1.5 rounded-md border border-[var(--gray-a5)] bg-[var(--color-panel-solid)] cursor-grab transition-colors hover:border-[var(--indigo-8)] hover:bg-[var(--indigo-a2)]"
                    >
                      <span
                        className="mt-1 size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: getTypeColor(func.return_type) }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-[var(--gray-12)] truncate" title={func.name}>
                          {func.name}
                        </div>
                        {func.docs && func.docs.length > 0 && (
                          <div className="text-[10px] text-[var(--gray-10)] line-clamp-2 overflow-hidden mt-0.5">
                            <SimpleMarkdown text={func.docs[0]} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tools */}
          <div className="flex flex-col gap-2">
            <SectionHeader label="Visualizations & Tools" icon={RxMagnifyingGlass} />
            <DraggableChip
              label="Output View"
              color={getTypeColor({ type: "any" })}
              dragType="jsonView"
              dataId="jsonView"
            />
            <DraggableChip
              label="Import File"
              color={getTypeColor({ "x-registry-ref": "PetriNet" })}
              dragType="fileImport"
            />
          </div>

          {/* Saved Pipelines */}
          <div className="flex flex-col gap-2">
            <SectionHeader label="Saved Pipelines" icon={FaSave} />
            {savedPipelines.length === 0 ? (
              <div className="p-3 border border-dashed border-[var(--gray-a5)] rounded-md text-center">
                <Text size="1" color="gray" className="italic">
                  No saved pipelines
                </Text>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {savedPipelines.map((pipeline) => (
                  <Card key={pipeline.name} size="1" className="group relative">
                    <Flex direction="column" gap="1">
                      <Text size="2" weight="bold" className="truncate pr-6">
                        {pipeline.name}
                      </Text>
                      <Text size="1" color="gray">
                        {new Date(pipeline.createdAt).toLocaleDateString()}
                      </Text>
                    </Flex>

                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-[var(--color-panel-solid)]/90 rounded shadow-sm">
                      <Tooltip content="Load">
                        <IconButton size="1" variant="ghost" onClick={() => loadPipeline(pipeline)}>
                          <FaFolderOpen />
                        </IconButton>
                      </Tooltip>
                      <Tooltip content="Delete">
                        <IconButton
                          size="1"
                          variant="ghost"
                          color="red"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPipelineToDelete(pipeline.name);
                          }}
                        >
                          <FaTrash />
                        </IconButton>
                      </Tooltip>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

export const PipelineSidebar = memo(PipelineSidebarImpl);
