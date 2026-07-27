import { Badge, Button, Dialog, Flex, Text } from "@r4pm/components/ui";
import { type DragEvent as ReactDragEvent, useRef, useState } from "react";
import toast from "react-hot-toast";
import { PiFileArrowUp } from "react-icons/pi";
import { backend } from "../backends";
import { canLoadFromPath } from "../persistence/capabilities";
import {
  dismissRelink,
  relinkRootFromBytes,
  relinkRootFromPath,
  skipMissingRoot,
} from "../persistence/restore";
import { type MissingRoot, useRelink } from "../stores/relink";
import { withBusy } from "./BusyOverlay";
import { extractPathsFromDataTransfer, filesOf } from "./dnd";
import { colorForKind, labelForKind } from "./object-colors";

const isDesktop = canLoadFromPath(backend);

/** The global import overlay stands down while this is open (see ImportProvider) so drops hit the rows. */
export function RelinkDialog() {
  const missing = useRelink((s) => s.missing);
  const [pending, setPending] = useState<MissingRoot | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const doRelink = (m: MissingRoot, run: () => Promise<void>) =>
    withBusy(`Relinking "${m.label}"…`, run).then(
      () => toast.success(`Relinked "${m.label}"`),
      (e) => toast.error(`Relink failed: ${String(e)}`),
    );

  const relinkFromFile = (m: MissingRoot, file: File) =>
    doRelink(m, async () => relinkRootFromBytes(backend, m, new Uint8Array(await file.arrayBuffer())));

  const onLocate = async (m: MissingRoot) => {
    if (isDesktop) {
      const path = (await backend.pickFiles?.({ multiple: false }))?.[0];
      if (path) void doRelink(m, () => relinkRootFromPath(backend, m, path));
    } else {
      setPending(m);
      fileInput.current?.click();
    }
  };

  const onRowDrop = (m: MissingRoot, e: ReactDragEvent) => {
    e.preventDefault();
    setDragOverId(null);
    const dt = e.dataTransfer;
    const path = isDesktop ? extractPathsFromDataTransfer(dt)[0] : undefined;
    if (path) {
      void doRelink(m, () => relinkRootFromPath(backend, m, path));
      return;
    }
    const file = filesOf(dt)[0];
    if (file) {
      void relinkFromFile(m, file);
      return;
    }
    toast.error("No file found in the drop.");
  };

  return (
    <Dialog.Root open={missing.length > 0} onOpenChange={(o) => !o && void dismissRelink(backend)}>
      <Dialog.Content maxWidth="520px">
        <Dialog.Title>Relink missing files</Dialog.Title>
        <Dialog.Description>
          <Text size="2" color="gray">
            These datasets could not be restored (the file moved, was deleted, or was not cached). Drop each
            file onto its row, or Locate it. Close to skip.
          </Text>
        </Dialog.Description>

        <Flex direction="column" gap="2" mt="4">
          {missing.map((m) => {
            const over = dragOverId === m.id;
            return (
              <Flex
                key={m.id}
                align="center"
                gap="3"
                className={`rounded-md border p-3 transition-colors ${
                  over
                    ? "border-[var(--indigo-8)] bg-[var(--indigo-a3)]"
                    : "border-dashed border-[var(--gray-a6)]"
                }`}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOverId(m.id);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                  if (dragOverId !== m.id) setDragOverId(m.id);
                }}
                onDragLeave={(e) => {
                  // Ignore leaves into child elements; only clear when actually leaving the row.
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverId(null);
                }}
                onDrop={(e) => onRowDrop(m, e)}
              >
                <PiFileArrowUp
                  size={18}
                  className={`shrink-0 ${over ? "text-[var(--indigo-11)]" : "text-[var(--gray-10)]"}`}
                />
                <div className="min-w-0 flex-1">
                  <Text size="2" weight="medium" as="div" className="truncate">
                    {m.label}
                  </Text>
                  <Text size="1" color="gray" as="div">
                    <Badge size="1" variant="soft" color={colorForKind(m.kind)}>
                      {labelForKind(m.kind)}
                    </Badge>{" "}
                    {over ? "Drop to relink" : "Drop file here"}
                  </Text>
                </div>
                <Button
                  size="1"
                  variant="soft"
                  color="gray"
                  onClick={() => void skipMissingRoot(backend, m.id)}
                >
                  Skip
                </Button>
                <Button size="1" onClick={() => void onLocate(m)}>
                  Locate…
                </Button>
              </Flex>
            );
          })}
        </Flex>

        {!isDesktop && (
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file && pending) void relinkFromFile(pending, file);
              setPending(null);
            }}
          />
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}
