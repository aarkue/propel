import { useState } from "react";
import { UpdateDialog } from "./UpdateDialog";
import { useUpdater } from "./useUpdater";

/** Version chip next to the logo; shows a pulsing dot when a desktop update is available. */
export function UpdaterChip() {
  const [open, setOpen] = useState(false);
  const updater = useUpdater();
  const hasUpdate = updater.available != null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={hasUpdate ? `Update ${updater.available?.version} available` : `propel v${updater.version}`}
        className="relative flex items-center h-6 px-1.5 rounded text-[11px] font-medium text-[var(--gray-11)] hover:bg-[var(--gray-a3)] cursor-pointer"
      >
        v{updater.version}
        {hasUpdate && (
          <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-[var(--blue-9)] ring-2 ring-[var(--color-panel-solid)] animate-pulse" />
        )}
      </button>
      <UpdateDialog open={open} onOpenChange={setOpen} updater={updater} />
    </>
  );
}
