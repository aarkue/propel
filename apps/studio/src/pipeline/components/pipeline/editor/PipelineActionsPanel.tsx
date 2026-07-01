import { Panel } from "@xyflow/react";
import {
  AlertDialog,
  Button,
  Card,
  Dialog,
  DropdownMenu,
  Flex,
  IconButton,
  ScrollArea,
  Text,
  TextField,
} from "@r4pm/components/ui";
import {
  FaEllipsisV,
  FaEraser,
  FaFileExport,
  FaFileImport,
  FaFolderOpen,
  FaMagic,
  FaSave,
  FaTrash,
} from "react-icons/fa";
import { useRef, useState, useCallback, useId } from "react";
import type { AppNode, SavedPipeline } from "./types";
import type { Edge } from "@xyflow/react";
import toast from "react-hot-toast";

interface PipelineActionsPanelProps {
  pipelineName: string;
  setPipelineName: (name: string) => void;
  currentPipelineName: string | null;
  savePipeline: (name: string) => void;
  savedPipelines: SavedPipeline[];
  loadPipeline: (pipeline: SavedPipeline) => void;
  deletePipeline: (name: string) => void;
  nodes: AppNode[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<AppNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  /** GC a function node's intermediate result handle (used when clearing the canvas). */
  unloadOutput: (nodeId: string) => void;
  handleAutoLayout: () => void;
  setCurrentPipelineName: (name: string | null) => void;
  saveDialogOpen: boolean;
  setSaveDialogOpen: (open: boolean) => void;
}

export function PipelineActionsPanel({
  pipelineName,
  setPipelineName,
  currentPipelineName,
  savePipeline,
  savedPipelines,
  loadPipeline,
  deletePipeline,
  nodes,
  edges,
  setNodes,
  setEdges,
  unloadOutput,
  handleAutoLayout,
  setCurrentPipelineName,
  saveDialogOpen,
  setSaveDialogOpen,
}: PipelineActionsPanelProps) {
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [pipelineToDelete, setPipelineToDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClear = useCallback(() => {
    setClearDialogOpen(true);
  }, []);

  const performClear = useCallback(() => {
    for (const n of nodes) if (n.type === "function") unloadOutput(n.id);
    setNodes([]);
    setEdges([]);
    setCurrentPipelineName(null);
    toast.success("Canvas cleared");
    setClearDialogOpen(false);
  }, [nodes, unloadOutput, setNodes, setEdges, setCurrentPipelineName]);

  const exportPipeline = () => {
    const data = JSON.stringify({ nodes, edges }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pipeline-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importPipeline = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const { nodes: newNodes, edges: newEdges } = JSON.parse(content);
        if (Array.isArray(newNodes) && Array.isArray(newEdges)) {
          setNodes(newNodes);
          setEdges(newEdges);
          toast.success("Pipeline imported");
        } else {
          toast.error("Invalid pipeline file");
        }
      } catch (_err) {
        toast.error("Failed to parse pipeline file");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const handleSave = () => {
    savePipeline(pipelineName);
    setSaveDialogOpen(false);
  };

  const pipelineNameID = useId();

  return (
    <Panel position="top-left">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Button variant="surface" color="gray" size="2" highContrast className="cursor-pointer shadow-sm">
            <FaEllipsisV /> Actions
            <DropdownMenu.TriggerIcon />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content size="2" align="start">
          <DropdownMenu.Item
            onSelect={() => {
              setPipelineName(currentPipelineName || "");
              setSaveDialogOpen(true);
            }}
          >
            <FaSave /> Save pipeline...
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => setLoadDialogOpen(true)}>
            <FaFolderOpen /> Load pipeline...
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item onSelect={exportPipeline}>
            <FaFileExport /> Export to file
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => fileInputRef.current?.click()}>
            <FaFileImport /> Import from file
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item onSelect={handleAutoLayout}>
            <FaMagic /> Auto layout
          </DropdownMenu.Item>
          <DropdownMenu.Item color="red" onSelect={handleClear}>
            <FaEraser /> Clear canvas
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={importPipeline} />

      <Dialog.Root open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <Dialog.Content maxWidth="400px">
          <Dialog.Title>Save Pipeline</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Give your pipeline a memorable name.
          </Dialog.Description>

          <Flex direction="column" gap="3">
            <label htmlFor={pipelineNameID}>
              <Text as="div" size="2" mb="1" weight="bold">
                Name
              </Text>
              <TextField.Root
                id={pipelineNameID}
                value={pipelineName}
                onChange={(e) => setPipelineName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSave();
                  }
                }}
              />
            </label>
          </Flex>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button onClick={handleSave}>Save</Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root open={loadDialogOpen} onOpenChange={setLoadDialogOpen}>
        <Dialog.Content maxWidth="450px">
          <Dialog.Title>Load Pipeline</Dialog.Title>
          <ScrollArea style={{ maxHeight: 300 }} className="pr-4">
            <div className="flex flex-col gap-2">
              {savedPipelines.length === 0 ? (
                <div className="p-8 text-center text-gray-400 border border-dashed rounded-lg">
                  No saved pipelines found
                </div>
              ) : (
                savedPipelines.map((p) => (
                  <Card
                    key={p.name}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => {
                      loadPipeline(p);
                      setLoadDialogOpen(false);
                    }}
                  >
                    <Flex justify="between" align="center">
                      <Flex direction="column">
                        <Text weight="bold">{p.name}</Text>
                        <Text size="1" color="gray">
                          {new Date(p.createdAt).toLocaleString()}
                        </Text>
                      </Flex>
                      <IconButton
                        size="1"
                        color="red"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPipelineToDelete(p.name);
                        }}
                      >
                        <FaTrash />
                      </IconButton>
                    </Flex>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Close
              </Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      <AlertDialog.Root open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialog.Content maxWidth="450px">
          <AlertDialog.Title>Clear Pipeline</AlertDialog.Title>
          <AlertDialog.Description size="2">
            Are you sure you want to clear the entire pipeline? This action cannot be undone.
          </AlertDialog.Description>

          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button variant="solid" color="red" onClick={performClear}>
                Clear Pipeline
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>

      <AlertDialog.Root open={!!pipelineToDelete} onOpenChange={(open) => !open && setPipelineToDelete(null)}>
        <AlertDialog.Content maxWidth="450px">
          <AlertDialog.Title>Delete Pipeline</AlertDialog.Title>
          <AlertDialog.Description size="2">
            Are you sure you want to delete "{pipelineToDelete}"? This action cannot be undone.
          </AlertDialog.Description>

          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button
                variant="solid"
                color="red"
                onClick={() => {
                  if (pipelineToDelete) {
                    deletePipeline(pipelineToDelete);
                    setPipelineToDelete(null);
                  }
                }}
              >
                Delete
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </Panel>
  );
}
