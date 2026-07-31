import { Button, Dialog, Flex, Text } from "@r4pm/components/ui";
import toast from "react-hot-toast";
import { PiFileArrowDown, PiFolder } from "react-icons/pi";
import { create } from "zustand";
import { backend } from "../backends";

type Container = "file" | "folder";

interface Pending {
  id: string;
  ext: string;
  resolve: (c: Container | null) => void;
}

const useContainerChoice = create<{ pending: Pending | null; set: (p: Pending | null) => void }>((set) => ({
  pending: null,
  set: (pending) => set({ pending }),
}));

function askContainer(id: string, ext: string): Promise<Container | null> {
  return new Promise((resolve) => useContainerChoice.getState().set({ id, ext, resolve }));
}

/**
 * Export a dataset to the user's disk.
 *
 * On desktop the engine writes the file itself: the OCEL 2.0 bundled format's uncompressed form is
 * a directory, which has no byte stream to hand back, and even for the single-file formats this
 * keeps a large log from crossing IPC. Web transports have no path to write to and keep taking the
 * bytes.
 */
export async function exportDataset(id: string, ext: string, mime: string): Promise<void> {
  const exportToPath = backend.exportObjectToPath?.bind(backend);
  try {
    if (!exportToPath) {
      const bytes = await backend.exportObject(id, ext);
      await backend.saveBytes(bytes, `${id}.${ext}`, mime);
      return;
    }
    // A zip format is equally valid as an archive or as the same layout unpacked into a folder.
    const container = ext.endsWith("zip") ? await askContainer(id, ext) : "file";
    if (container === null) return;
    const { open, save } = await import("@tauri-apps/plugin-dialog");
    const path =
      container === "folder"
        ? await open({ directory: true, title: `Export ${id} into a folder` })
        : await save({
            title: `Export ${id}`,
            defaultPath: `${id}.${ext}`,
            filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
          });
    if (typeof path !== "string") return;
    await exportToPath(id, ext, path);
  } catch (e) {
    toast.error(`Export failed: ${String(e)}`);
  }
}

/** Mounted once at the app root; `exportDataset` drives it when a format has two container forms. */
export function ExportContainerDialog() {
  const pending = useContainerChoice((s) => s.pending);

  const answer = (c: Container | null) => {
    useContainerChoice.getState().set(null);
    pending?.resolve(c);
  };

  return (
    <Dialog.Root
      open={pending !== null}
      onOpenChange={(o) => {
        if (!o) answer(null);
      }}
    >
      <Dialog.Content maxWidth="420px" data-testid="export-container-picker">
        <Dialog.Title>Export {pending?.id}</Dialog.Title>
        <Dialog.Description size="2" color="gray">
          .{pending?.ext} holds the same files either way: zipped into one archive, or laid out in a folder.
        </Dialog.Description>
        <Flex direction="column" gap="2" mt="4">
          <Button variant="soft" data-testid="export-as-file" onClick={() => answer("file")}>
            <PiFileArrowDown />
            As a single file
            <Text size="1" color="gray" ml="1">
              (.{pending?.ext})
            </Text>
          </Button>
          <Button variant="soft" data-testid="export-as-folder" onClick={() => answer("folder")}>
            <PiFolder />
            As a folder
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
