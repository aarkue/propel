import { Button, DropdownMenu, IconButton, Kbd, Separator } from "@r4pm/components/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { PiDotsThreeVertical, PiMagnifyingGlass, PiMoon, PiPlus, PiStack, PiSun } from "react-icons/pi";
import { backend } from "../backends";
import { openProjectFile, saveProjectFile } from "../persistence/restore";
import { withBusy } from "./BusyOverlay";
import { CommandPalette } from "./CommandPalette";
import { LoadedStrip } from "./LoadedStrip";
import { LoadedDialog } from "./LoadedDialog";
import { useArtifacts, useDatasets } from "../stores";
import { ImportButton } from "./ImportButton";
import { PanelGallery } from "./PanelGallery";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { SettingsDialog } from "./SettingsDialog";
import { UpdaterChip } from "./updater/UpdaterChip";
import { isMac, shortcutLabel } from "./platform";
import { useThemeMode } from "./theme-context";

/** Application top bar: identity, import, add-panel, dataset chips, command palette, theme. */
export function TopBar({ children }: { children: ReactNode }) {
  const { resolved, toggle: toggleTheme } = useThemeMode();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadedOpen, setLoadedOpen] = useState(false);
  const loadedCount = useDatasets((s) => s.datasets.length) + useArtifacts((s) => s.artifacts.length);
  const openInputRef = useRef<HTMLInputElement>(null);

  const handleSaveProject = async () => {
    try {
      await saveProjectFile(backend);
    } catch (e) {
      toast.error(`Could not save project: ${String(e)}`);
    }
  };

  const handleOpenProject = async (file: File) => {
    try {
      const n = await withBusy(`Opening ${file.name}…`, async () => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        return openProjectFile(backend, bytes);
      });
      toast.success(`Opened project (${n} object${n === 1 ? "" : "s"})`);
    } catch (e) {
      toast.error(`Could not open project: ${String(e)}`);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onOpenGallery = () => setGalleryOpen(true);
    const onOpenSettings = () => setSettingsOpen(true);
    window.addEventListener("propel-open-gallery", onOpenGallery);
    window.addEventListener("propel-open-settings", onOpenSettings);
    return () => {
      window.removeEventListener("propel-open-gallery", onOpenGallery);
      window.removeEventListener("propel-open-settings", onOpenSettings);
    };
  }, []);

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center h-11 px-3 gap-2 shrink-0 bg-[var(--color-panel-solid)] border-b border-[var(--gray-a5)] select-none">
        <div className="flex items-center gap-1.5 pr-1">
          <img src="/icon.png" className="size-5 min-h-5 min-w-5" alt="propel" />
          <span className="text-sm font-semibold text-[var(--gray-12)] hidden sm:inline">propel</span>
          <UpdaterChip />
        </div>
        <Separator orientation="vertical" size="1" className="!mx-1 hidden sm:block" />
        <ProjectSwitcher />
        <ImportButton />
        <Button size="2" variant="soft" onClick={() => setGalleryOpen(true)}>
          <PiPlus />
          <span className="hidden sm:inline">Add panel</span>
        </Button>
        <Separator orientation="vertical" size="1" className="!mx-1 hidden sm:block" />
        <div className="hidden md:flex min-w-0 flex-1">
          <LoadedStrip />
        </div>
        {loadedCount > 0 && (
          <button
            type="button"
            onClick={() => setLoadedOpen(true)}
            title="Loaded data"
            className="flex items-center gap-1 h-7 px-2 rounded text-xs text-[var(--gray-11)] hover:bg-[var(--gray-a3)] cursor-pointer shrink-0 ml-auto md:ml-0"
          >
            <PiStack size={14} />
            <span className="tabular-nums">{loadedCount}</span>
          </button>
        )}
        <div className="flex items-center gap-1 pl-1 shrink-0">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-1 h-7 px-2 rounded text-xs text-[var(--gray-11)] hover:bg-[var(--gray-a3)] cursor-pointer"
            title={`Command palette (${shortcutLabel("K")})`}
          >
            <PiMagnifyingGlass size={13} />
            <span className="hidden sm:contents">
              <Kbd size="1">{isMac() ? "⌘" : "Ctrl"}</Kbd>
              <Kbd size="1">K</Kbd>
            </span>
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <IconButton variant="ghost" color="gray" title="More">
                <PiDotsThreeVertical />
              </IconButton>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
              <DropdownMenu.Item onClick={() => setPaletteOpen(true)}>
                Command palette <Kbd className="ml-auto">{shortcutLabel("K")}</Kbd>
              </DropdownMenu.Item>
              <DropdownMenu.Item onClick={toggleTheme}>
                {resolved === "dark" ? "Light mode" : "Dark mode"}
                <span className="ml-auto">{resolved === "dark" ? <PiSun /> : <PiMoon />}</span>
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item onClick={() => window.dispatchEvent(new CustomEvent("propel-show-welcome"))}>
                Show welcome screen
              </DropdownMenu.Item>
              <DropdownMenu.Item onClick={() => setSettingsOpen(true)}>Preferences…</DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item onClick={() => void handleSaveProject()}>Save project…</DropdownMenu.Item>
              <DropdownMenu.Item onClick={() => openInputRef.current?.click()}>
                Open project…
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
          <input
            ref={openInputRef}
            type="file"
            accept=".propel,application/octet-stream"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleOpenProject(f);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      <div className="flex-1 min-h-0 relative">{children}</div>

      <PanelGallery open={galleryOpen} onClose={() => setGalleryOpen(false)} />
      <LoadedDialog open={loadedOpen} onClose={() => setLoadedOpen(false)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
