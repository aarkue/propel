import { SegmentedControl } from "@r4pm/components/ui";
import type { IDockviewPanelProps } from "dockview";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import type { IconType } from "react-icons";
import { PiCheckCircle, PiListChecks } from "react-icons/pi";
import { ViewerExportFrame } from "@r4pm/components";
import { backend } from "../backends";
import { PanelErrorBoundary } from "./PanelErrorBoundary";
import { usePanelState } from "./panel-state";
import type { PanelCategory, PanelDefinition } from "./types";

interface Tab {
  id: string;
  label: string;
  /** The panel type shown in this tab. */
  panel: string;
}

interface TabbedSpec {
  type: string;
  name: string;
  description: string;
  category: PanelCategory;
  icon: IconType;
  order: number;
  keywords?: string[];
  tabs: Tab[];
}

/** Views of one computation, one panel each with a tab per view. */
export const TABBED: TabbedSpec[] = [
  {
    type: "group:conformance",
    name: "Conformance",
    description:
      "Fitness of the log against a saved Petri net, with alignments on the net, per variant and as replay.",
    category: "conformance",
    icon: PiCheckCircle,
    order: 5,
    keywords: ["fitness", "precision", "alignments", "deviations", "replay"],
    tabs: [
      { id: "model", label: "On the model", panel: "alignmentNet" },
      { id: "variants", label: "Variants", panel: "alignmentList" },
      { id: "replay", label: "Replay", panel: "netAnimation" },
    ],
  },
  {
    type: "group:ocDeclare",
    name: "OC-DECLARE",
    description:
      "Discover, edit and evaluate object-centric DECLARE constraints, and where they are violated.",
    category: "ocel",
    icon: PiListChecks,
    order: 15,
    tabs: [
      { id: "constraints", label: "Constraints", panel: "ocDeclare" },
      { id: "violations", label: "Violations", panel: "ocDeclareViolations" },
    ],
  },
];

/** Panels replaced by others: hidden from the gallery and search, kept for opening saved layouts. */
export const REPLACED = new Set(["logSummary", "conformance", "ocDeclareOutput"]);

const MEMBER = new Map(
  TABBED.flatMap((g) => g.tabs.map((t) => [t.panel, { group: g.type, tab: t.id }] as const)),
);

/** The tabbed panel and tab that show panel `type`, if it is one of their views. */
export function tabOf(type: string): { group: string; tab: string } | undefined {
  return MEMBER.get(type);
}

/**
 * The tab strip of the enclosing tabbed panel. A panel's header (`PanelFrame`) shows it before the
 * dataset picker and claims it, so the tabbed panel draws no strip of its own.
 */
export const PanelTabsContext = createContext<{
  strip: ReactNode;
  claim: () => void;
  /** Shows the tab with panel `type`, opened with `params`; false when this panel has no such tab. */
  open: (type: string, params: Record<string, unknown>) => boolean;
} | null>(null);

export function usePanelTabs(): ReactNode {
  const ctx = useContext(PanelTabsContext);
  useLayoutEffect(() => ctx?.claim(), [ctx]);
  return ctx?.strip ?? null;
}

/** Opens panel `type` in a tab of the enclosing tabbed panel; false when it has no such tab. */
export function useOpenTab(): (type: string, params: Record<string, unknown>) => boolean {
  const ctx = useContext(PanelTabsContext);
  return ctx?.open ?? (() => false);
}

/**
 * `props` as the view of tab `id` sees them: the dataset is shared by all tabs, everything else
 * the view stores is kept per tab.
 */
function tabProps(props: IDockviewPanelProps, id: string): IDockviewPanelProps {
  const key = `tab.${id}`;
  const own = (props.params?.[key] as Record<string, unknown> | undefined) ?? {};
  const api = new Proxy(props.api, {
    get(target, prop) {
      if (prop === "updateParameters") {
        return (patch: Record<string, unknown>) => {
          const { datasetId, ...rest } = patch;
          const current = (target.getParameters()?.[key] as Record<string, unknown> | undefined) ?? {};
          target.updateParameters({
            ...("datasetId" in patch ? { datasetId } : {}),
            ...(Object.keys(rest).length ? { [key]: { ...current, ...rest } } : {}),
          });
        };
      }
      if (prop === "getParameters") {
        return () => ({
          ...((target.getParameters()?.[key] as object) ?? {}),
          datasetId: target.getParameters()?.datasetId,
        });
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return {
    ...props,
    api,
    params: { ...own, datasetId: props.params?.datasetId, autorun: props.params?.autorun },
  };
}

export function tabbedPanels(panel: (type: string) => PanelDefinition | undefined): PanelDefinition[] {
  return TABBED.map((spec) => {
    const members = spec.tabs.map((t) => panel(t.panel)).filter((p): p is PanelDefinition => !!p);
    const supports = [...new Set(members.flatMap((p) => p.supports ?? []))];
    function TabbedPanel(props: IDockviewPanelProps) {
      const [tab, setTab] = usePanelState<string>(props, "tab", spec.tabs[0].id);
      const current = spec.tabs.find((t) => t.id === tab) ?? spec.tabs[0];
      const Inner = panel(current.panel)?.component;
      const inner = useMemo(() => tabProps(props, current.id), [props, current.id]);
      const [claimedBy, setClaimedBy] = useState<string | null>(null);
      const strip = (
        <SegmentedControl.Root
          size="1"
          value={current.id}
          onValueChange={setTab}
          style={{ flex: "0 0 auto" }}
        >
          {spec.tabs.map((t) => (
            <SegmentedControl.Item key={t.id} value={t.id}>
              {t.label}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl.Root>
      );
      const { api } = props;
      const open = useCallback(
        (type: string, params: Record<string, unknown>) => {
          const t = spec.tabs.find((t) => t.panel === type);
          if (!t) return false;
          const { datasetId: _shared, ...own } = params;
          const key = `tab.${t.id}`;
          const stored = (api.getParameters()?.[key] as Record<string, unknown> | undefined) ?? {};
          api.updateParameters({ tab: t.id, [key]: { ...stored, ...own } });
          return true;
        },
        [api],
      );
      const ctx = useMemo(
        () => ({ strip, claim: () => setClaimedBy(current.id), open }),
        [strip, current.id, open],
      );
      return (
        <PanelTabsContext.Provider value={ctx}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            {claimedBy !== current.id && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "6px 12px",
                  minHeight: 44,
                  borderBottom: "1px solid var(--gray-a4)",
                  background: "var(--color-panel-solid)",
                }}
              >
                {strip}
              </div>
            )}
            <div style={{ flex: 1, minHeight: 0 }}>
              {/* A crash in one tab leaves the strip usable, so another tab can be picked. */}
              <PanelErrorBoundary key={current.id}>
                {Inner &&
                  (panel(current.panel)?.genericExport !== false ? (
                    <ViewerExportFrame
                      key={current.id}
                      filename={current.panel}
                      onSave={(d, f, m) => backend.saveBytes(d, f, m)}
                      style={{ height: "100%", width: "100%" }}
                    >
                      <Inner {...inner} />
                    </ViewerExportFrame>
                  ) : (
                    <Inner key={current.id} {...inner} />
                  ))}
              </PanelErrorBoundary>
            </div>
          </div>
        </PanelTabsContext.Provider>
      );
    }
    return {
      type: spec.type,
      name: spec.name,
      description: spec.description,
      category: spec.category,
      icon: spec.icon,
      order: spec.order,
      supports,
      keywords: [...(spec.keywords ?? []), ...members.flatMap((p) => [p.name, ...(p.keywords ?? [])])],
      component: TabbedPanel,
      // Each tab gets the export frame its own view asks for.
      genericExport: false,
    };
  });
}
