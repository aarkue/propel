import { create } from "zustand";

/** Whether the Explore home covers the dock. */
export const useExplore = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
