import { type ReactNode, useMemo } from "react";
import toast from "react-hot-toast";
import { makeColorResolver, makeFormat, registerColorKey, stableColor, usePreferences } from "../stores";
import { ViewerConfigProvider, type ViewerAction } from "@r4pm/components";

/** Propel-provided right-click actions, available on any viewer element. */
const APP_ACTIONS: ViewerAction[] = [
  {
    id: "copy-name",
    label: "Copy name",
    run: (t) => {
      navigator.clipboard?.writeText(t.key);
      toast.success(`Copied "${t.key}"`);
    },
  },
  {
    id: "set-color",
    label: "Set color…",
    run: (t) => {
      const input = document.createElement("input");
      input.type = "color";
      input.value =
        usePreferences.getState().colorOverrides[`${t.scope}:${t.key}`] ?? stableColor(`${t.scope}:${t.key}`);
      input.addEventListener("input", () => usePreferences.getState().setColor(t.scope, t.key, input.value));
      input.click();
    },
  },
  {
    id: "reset-color",
    label: "Reset color",
    run: (t) => usePreferences.getState().clearColor(t.scope, t.key),
  },
];

/**
 * Supplies every viewer (panels + pipeline nodes) with shared colors, formatting, and right-click
 * actions from the preferences store. Viewers read this via `useViewerConfig`; explicit props still
 * override per instance.
 */
export function AppViewerConfig({ children }: { children: ReactNode }) {
  const colorOverrides = usePreferences((s) => s.colorOverrides);
  const durationStyle = usePreferences((s) => s.durationStyle);
  const alignmentStyle = usePreferences((s) => s.alignmentStyle);

  const value = useMemo(() => {
    const base = makeColorResolver(colorOverrides);
    return {
      // Record every resolved (scope, key) so the preferences editor can list all encountered
      // activities / object types. Batched; safe to call during child render.
      colorOf: (scope: string, key: string) => {
        registerColorKey(scope, key);
        return base(scope, key);
      },
      format: makeFormat({ durationStyle }),
      alignmentStyle,
      actions: APP_ACTIONS,
    };
  }, [colorOverrides, durationStyle, alignmentStyle]);

  return <ViewerConfigProvider value={value}>{children}</ViewerConfigProvider>;
}
