import { type CSSProperties, useCallback } from "react";
import { shadeHex } from "../dfg/util/colors";
import type { ColorResolver } from "../viewer/viewer-config";
import type { Ocpn, VizTransport } from "../viz";
import type { ArcContext, ArcData, ArcPresentation, PlaceData } from "./editor/Editor";
import { noopPetriLayout } from "./editor/helpers/layout-graph";
import { layoutOcpnElements, ocpnElements } from "./editor/helpers/ocpn-viz";
import type { PetriElements } from "./editor/helpers/viz-layout";

// The object-centric Petri net views' layout and on-screen look, drawn like rust4pm's `ocpn` export.

/** Lay `ocpn` out with rust4pm, or in a row without a `viz` transport. */
export function layoutOcpn(viz: VizTransport | undefined, ocpn: Ocpn): Promise<PetriElements> {
  const elements = ocpnElements(ocpn);
  return viz ? layoutOcpnElements(viz, ocpn, elements) : noopPetriLayout(elements.nodes, elements.edges);
}

/** Border and token color of a place without an object type yet. */
export const NEUTRAL = "var(--gray-12)";

/** An object type's color from the host, shaded for the screen. */
export type OtColor = (objectType: string, mode?: "normal" | "foreground" | "light") => string;

export function useOtColor(colorOf: ColorResolver | undefined): OtColor {
  return useCallback<OtColor>(
    (objectType, mode = "normal") => shadeHex(colorOf?.("objectType", objectType) ?? "#888888", mode),
    [colorOf],
  );
}

/** A place of `objectType`: border in the type's color, light fill and tokens of it. */
function ocpnPlaceStyle(objectType: string | undefined, otColor: OtColor): Partial<PlaceData> {
  if (!objectType) return { tokenColor: NEUTRAL, style: { borderColor: NEUTRAL } };
  return {
    label: objectType,
    tokenColor: otColor(objectType, "foreground"),
    style: { borderColor: otColor(objectType), background: otColor(objectType, "light") },
  };
}

/** An arc in `color`, its place's type color. A variable one bold and dashed. */
function ocpnArcStyle(color: string | undefined, variable: boolean): CSSProperties {
  return {
    ...(color ? { stroke: color } : {}),
    strokeWidth: variable ? 4 : 2,
    strokeDasharray: variable ? "6 3" : undefined,
  };
}

/** Editor overlays drawing places by their `objectType` and arcs by their place's type and
 *  `variable` flag. `typeOfPlace` gives a place's object type by its id. */
export function ocpnOverlays(otColor: OtColor, typeOfPlace: (id: string) => string | undefined) {
  return {
    placeOverlay: (_id: string, d: PlaceData) => ocpnPlaceStyle(d.objectType, otColor),
    arcOverlay: (arc: ArcContext, d: ArcData): ArcPresentation => {
      const objectType = typeOfPlace(arc.fromType === "place" ? arc.from : arc.to);
      return { style: ocpnArcStyle(objectType ? otColor(objectType) : undefined, !!d.variable) };
    },
  };
}
