import { createContext, useContext } from "react";
import type { ItemKindInfo } from "@r4pm/client";

/** Import actions shared by the top bar, welcome screen, and command palette. */
export interface ImportApi {
  /** Registry kinds that advertise at least one import format. */
  importableKinds: ItemKindInfo[];
  /** Open a file dialog scoped to this kind's formats and load the chosen file as it. */
  importKind: (kind: ItemKindInfo) => void;
}

export const ImportContext = createContext<ImportApi>({
  importableKinds: [],
  importKind: () => {},
});

export const useImport = (): ImportApi => useContext(ImportContext);
