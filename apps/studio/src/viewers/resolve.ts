import type { ViewerDef, ViewerRegistry } from "./registry";

export const resolveViewerForReturnType = (
  r: ViewerRegistry,
  title: string,
  sourceBindingId?: string,
): ViewerDef | undefined => r.resolve({ returnType: title, sourceBindingId });

/** ALL viewers that accept a return-type, so a host can let the user pick among them. */
export const resolveAllViewersForReturnType = (
  r: ViewerRegistry,
  title: string,
  sourceBindingId?: string,
): ViewerDef[] => r.all().filter((v) => v.accepts({ returnType: title, sourceBindingId }));
