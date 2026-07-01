import { createContext, useContext } from "react";
import type { BackendContext } from "@r4pm/client";
import { backend } from "../backends";

/**
 * React context for the active backend. Defaults to the detected singleton so
 * shell components can `useBackend()` without prop-drilling; `SharedRootApp`
 * still provides it explicitly so the shell stays reusable with another backend.
 */
export const BackendReactContext = createContext<BackendContext>(backend);

export const useBackend = (): BackendContext => useContext(BackendReactContext);
