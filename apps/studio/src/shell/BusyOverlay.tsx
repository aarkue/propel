import { Spinner } from "@r4pm/components/ui";
import { create } from "zustand";

interface BusyState {
  message: string | null;
  setMessage: (m: string | null) => void;
}

const useBusy = create<BusyState>((set) => ({
  message: null,
  setMessage: (message) => set({ message }),
}));

export async function withBusy<T>(message: string, fn: () => Promise<T>): Promise<T> {
  useBusy.getState().setMessage(message);
  try {
    return await fn();
  } finally {
    useBusy.getState().setMessage(null);
  }
}

export function BusyOverlay() {
  const message = useBusy((s) => s.message);
  if (!message) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 px-10 py-8 rounded-xl bg-(--color-panel-solid) shadow-2xl border border-(--gray-6)">
        <Spinner size="3" style={{ width: 36, height: 36, color: "var(--indigo-8)" }} />
        <div className="text-base font-medium text-(--gray-12)">{message}</div>
      </div>
    </div>
  );
}
