import { PiFileArrowUp } from "react-icons/pi";

/** Full-window overlay shown while a file is being dragged over the app. */
export function GlobalDropOverlay() {
  return (
    <div className="fixed inset-0 z-1000 pointer-events-none flex items-center justify-center">
      <div className="absolute inset-4 rounded-xl border-4 border-dashed border-(--indigo-9) bg-(--indigo-a3)/70 backdrop-blur-sm" />
      <div className="relative flex flex-col items-center gap-3 px-8 py-6 rounded-lg bg-(--color-panel-solid) shadow-lg border border-(--indigo-8)">
        <div className="rounded-full bg-(--indigo-a4) text-(--indigo-11) p-3">
          <PiFileArrowUp size={36} />
        </div>
        <div className="text-lg font-medium text-(--gray-12)">Drop to import</div>
        <div className="text-sm text-(--gray-11)">
          Any registered file type; you'll pick the kind if it's ambiguous
        </div>
      </div>
    </div>
  );
}
