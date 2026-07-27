import { AlertDialog, Button, Dialog, DropdownMenu, Flex, Text, TextField } from "@r4pm/components/ui";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { PiCaretDown, PiCheck, PiFolder } from "react-icons/pi";
import { backend } from "../backends";
import type { ProjectMeta } from "../persistence/idb";
import {
  createProject,
  deleteProject,
  listProjectsWithCurrent,
  renameProject,
  switchProject,
} from "../persistence/restore";
import { supportsProjects } from "../persistence/capabilities";
import { DEFAULT_PROJECT } from "../persistence/session";
import { withBusy } from "./BusyOverlay";

export function ProjectSwitcher() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [current, setCurrent] = useState<string>(DEFAULT_PROJECT);
  // window.prompt/confirm are unavailable in the Tauri webview, hence in-app dialogs.
  const [nameDialog, setNameDialog] = useState<null | { mode: "new" | "rename"; value: string }>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = useCallback(async () => {
    const res = await listProjectsWithCurrent();
    setProjects([...res.projects].sort((a, b) => b.updatedAt - a.updatedAt));
    setCurrent(res.current);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!supportsProjects(backend)) return null;

  const currentName = projects.find((p) => p.id === current)?.name ?? "Default";

  const onSwitch = async (id: string) => {
    if (id === current) return;
    try {
      await withBusy("Switching project…", () => switchProject(backend, id));
    } catch (e) {
      toast.error(`Switch failed: ${String(e)}`);
    }
    await refresh();
  };
  const submitName = async () => {
    if (!nameDialog) return;
    const { mode, value } = nameDialog;
    setNameDialog(null);
    if (mode === "new") {
      try {
        await withBusy("Creating project…", () => createProject(backend, value));
      } catch (e) {
        toast.error(`Could not create project: ${String(e)}`);
      }
    } else {
      await renameProject(current, value);
    }
    await refresh();
  };
  const onDelete = async () => {
    setConfirmDelete(false);
    await deleteProject(backend, current);
    await refresh();
  };

  return (
    <>
      <DropdownMenu.Root onOpenChange={(open) => open && void refresh()}>
        <DropdownMenu.Trigger>
          <button
            type="button"
            title="Projects"
            className="flex items-center gap-1 h-7 px-2 rounded text-xs text-(--gray-11) hover:bg-(--gray-a3) cursor-pointer max-w-40"
          >
            <PiFolder size={13} className="shrink-0" />
            <span className="truncate">{currentName}</span>
            <PiCaretDown size={11} className="shrink-0 opacity-70" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="start">
          <DropdownMenu.Label>Projects</DropdownMenu.Label>
          {projects.map((p) => (
            <DropdownMenu.Item key={p.id} onClick={() => void onSwitch(p.id)}>
              <span className="w-4 shrink-0">{p.id === current ? <PiCheck size={13} /> : null}</span>
              <span className="truncate">{p.name}</span>
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator />
          <DropdownMenu.Item onClick={() => setNameDialog({ mode: "new", value: "Untitled" })}>
            New project…
          </DropdownMenu.Item>
          <DropdownMenu.Item onClick={() => setNameDialog({ mode: "rename", value: currentName })}>
            Rename current…
          </DropdownMenu.Item>
          {current !== DEFAULT_PROJECT && (
            <DropdownMenu.Item color="red" onClick={() => setConfirmDelete(true)}>
              Delete current
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      <Dialog.Root open={nameDialog != null} onOpenChange={(o) => !o && setNameDialog(null)}>
        <Dialog.Content maxWidth="420px">
          <Dialog.Title>{nameDialog?.mode === "rename" ? "Rename project" : "New project"}</Dialog.Title>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitName();
            }}
          >
            <TextField.Root
              autoFocus
              placeholder="Project name"
              value={nameDialog?.value ?? ""}
              onChange={(e) => setNameDialog((d) => (d ? { ...d, value: e.target.value } : d))}
            />
            <Flex gap="3" mt="4" justify="end">
              <Button type="button" variant="soft" color="gray" onClick={() => setNameDialog(null)}>
                Cancel
              </Button>
              <Button type="submit">{nameDialog?.mode === "rename" ? "Rename" : "Create"}</Button>
            </Flex>
          </form>
        </Dialog.Content>
      </Dialog.Root>

      <AlertDialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialog.Content maxWidth="420px">
          <AlertDialog.Title>Delete project</AlertDialog.Title>
          <AlertDialog.Description>
            <Text>Delete project "{currentName}"? Its cached data will be removed.</Text>
          </AlertDialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button color="red" onClick={() => void onDelete()}>
                Delete
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </>
  );
}
