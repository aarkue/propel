import { Badge, ContextMenu, Heading, Text } from "@r4pm/components/ui";
import {
  type DockviewApi,
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewDefaultTabProps,
  type IDockviewPanelProps,
  type SerializedDockview,
  themeDark,
  themeLight,
} from "dockview";
import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { PiArrowDown, PiArrowLeft, PiArrowRight, PiArrowUp, PiPlus, PiSparkle, PiX } from "react-icons/pi";
import { getDockviewApi, setDockviewApi } from "./dockviewApi";
import { useDatasets } from "../stores";
import { ViewerExportFrame } from "@r4pm/components";
import { addPanelToDockview, getPanelByType, panelComponents, VISIBLE_PANELS } from "../panels/registry";
import { backend } from "../backends";
import { colorForKind, labelForKind } from "./object-colors";
import { useThemeMode } from "./theme-context";
import { WelcomeScreen } from "./WelcomeScreen";

const LAYOUT_KEY = "propel-panels";

export function Dashboard() {
  const { resolved } = useThemeMode();
  const apiRef = useRef<DockviewApi | null>(null);

  // Clear the shared api on unmount, but only if it still points at THIS instance. In dev
  // (StrictMode double-mount + fast-refresh) an old instance's cleanup must not null the new
  // instance's api, or panel-adds silently no-op (see addPanelToDockview's guard).
  useEffect(
    () => () => {
      if (getDockviewApi() === apiRef.current) setDockviewApi(null);
    },
    [],
  );

  // Dev self-heal: a hot reload can null the shared api global (module re-eval, or a stale
  // instance's cleanup) while THIS DockviewReact instance is still alive. `onReady` is one-shot
  // and won't refire for a preserved instance, so re-publish the live api on every render.
  useEffect(() => {
    if (!import.meta.hot) return;
    if (apiRef.current && getDockviewApi() !== apiRef.current) setDockviewApi(apiRef.current);
  });

  const onReady = (event: DockviewReadyEvent) => {
    apiRef.current = event.api;
    setDockviewApi(event.api);

    // Persist the layout on every change so it survives reloads.
    event.api.onDidLayoutChange(() => {
      try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(event.api.toJSON()));
      } catch (e) {
        console.error("error saving layout", e);
      }
    });

    try {
      const saved = localStorage.getItem(LAYOUT_KEY);
      if (saved) {
        const layout: SerializedDockview = JSON.parse(saved);
        if (Object.keys(layout.panels).length > 0) {
          event.api.fromJSON(layout);
          return;
        }
      }
    } catch (e) {
      console.error("error loading layout", e);
    }
  };

  return (
    <div className="w-full h-full relative">
      <DockviewReact
        defaultRenderer="always"
        theme={resolved === "dark" ? themeDark : themeLight}
        className="w-full h-full"
        onReady={onReady}
        components={getComponents()}
        watermarkComponent={EmptyPanelsPlaceholder}
        defaultTabComponent={CustomTab}
        rightHeaderActionsComponent={AddTabButton}
      />
    </div>
  );
}

function AddTabButton() {
  return (
    <button
      type="button"
      aria-label="Add panel"
      title="Add panel"
      onClick={() => window.dispatchEvent(new CustomEvent("propel-open-gallery"))}
      className="flex mt-1 items-center justify-center w-7 h-7 mx-0.5 rounded hover:bg-[var(--gray-a4)] text-[var(--gray-11)] hover:text-[var(--gray-12)] transition-colors cursor-pointer"
    >
      <PiPlus size={14} />
    </button>
  );
}

function CustomTab({
  api,
  containerApi,
  hideClose,
  closeActionOverride,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  tabLocation,
  ...rest
}: IDockviewDefaultTabProps) {
  const [title, setTitle] = useState(api.title);
  useEffect(() => {
    const d = api.onDidTitleChange((e) => setTitle(e.title));
    return () => d.dispose();
  }, [api]);

  const Icon = getPanelByType(api.component)?.icon;
  const isMiddleButton = useRef(false);

  const onClose = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (closeActionOverride) closeActionOverride();
      else api.close();
    },
    [api, closeActionOverride],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      isMiddleButton.current = e.button === 1;
      onPointerDown?.(e);
    },
    [onPointerDown],
  );
  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isMiddleButton.current && e.button === 1 && !hideClose) {
        isMiddleButton.current = false;
        onClose(e);
      }
      onPointerUp?.(e);
    },
    [onPointerUp, onClose, hideClose],
  );
  const handlePointerLeave = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      isMiddleButton.current = false;
      onPointerLeave?.(e);
    },
    [onPointerLeave],
  );

  const splitItems: { label: string; icon: ReactElement; direction: "right" | "left" | "above" | "below" }[] =
    [
      { label: "Split right", icon: <PiArrowRight size={14} />, direction: "right" },
      { label: "Split left", icon: <PiArrowLeft size={14} />, direction: "left" },
      { label: "Split down", icon: <PiArrowDown size={14} />, direction: "below" },
      { label: "Split up", icon: <PiArrowUp size={14} />, direction: "above" },
    ];

  const handleSplit = useCallback(
    (direction: "right" | "left" | "above" | "below") => {
      const newGroup = containerApi.addGroup({ referenceGroup: api.group, direction });
      api.moveTo({ group: newGroup });
    },
    [api, containerApi],
  );

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>
        <div
          {...rest}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          className="dv-default-tab"
        >
          <span className="dv-default-tab-content" style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {Icon && <Icon size={13} style={{ opacity: 0.7, flexShrink: 0 }} />}
            {title}
          </span>
          {!hideClose && tabLocation !== "headerOverflow" && (
            <button
              type="button"
              className="dv-default-tab-action"
              aria-label={`Close ${title}`}
              onPointerDown={(e) => e.preventDefault()}
              onClick={onClose}
            >
              <PiX size={12} />
            </button>
          )}
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Content size="1">
        <ContextMenu.Label>{title}</ContextMenu.Label>
        <ContextMenu.Separator />
        {splitItems.map((item) => (
          <ContextMenu.Item key={item.direction} onClick={() => handleSplit(item.direction)}>
            {item.icon} {item.label}
          </ContextMenu.Item>
        ))}
        {!hideClose && (
          <>
            <ContextMenu.Separator />
            <ContextMenu.Item color="red" onClick={() => api.close()}>
              <PiX size={14} /> Close
            </ContextMenu.Item>
          </>
        )}
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
}

function EmptyPanelsPlaceholder() {
  const datasets = useDatasets((s) => s.datasets);
  const loadedKinds = new Set(datasets.map((d) => d.kind));
  // Suggest the first few panels compatible with each loaded kind.
  const suggested = VISIBLE_PANELS.filter((p) => p.supports?.some((k) => loadedKinds.has(k)) ?? false).slice(
    0,
    8,
  );
  const [forceWelcome, setForceWelcome] = useState(false);

  useEffect(() => {
    const onShow = () => setForceWelcome(true);
    window.addEventListener("propel-show-welcome", onShow);
    return () => window.removeEventListener("propel-show-welcome", onShow);
  }, []);

  if (datasets.length === 0 || forceWelcome) {
    return <WelcomeScreen canReturn={forceWelcome} onReturn={() => setForceWelcome(false)} />;
  }

  return (
    <div className="inset-0 z-50 flex items-center justify-center bg-[var(--color-background)] overflow-auto h-full">
      <div className="flex flex-col items-center text-center gap-4 px-8 py-8 max-w-3xl">
        <div className="rounded-full bg-[var(--indigo-a3)] text-[var(--indigo-11)] p-3">
          <PiSparkle size={28} />
        </div>
        <div>
          <Heading size="5" className="!mb-1">
            Start exploring
          </Heading>
          <Text size="2" color="gray">
            Pick a starter panel or browse the full gallery.
          </Text>
        </div>

        {suggested.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full mt-2">
            {suggested.map((panel) => {
              const Icon = panel.icon;
              return (
                <button
                  key={panel.type}
                  type="button"
                  onClick={() => addPanelToDockview(panel.type)}
                  className="group flex flex-col items-start text-left gap-2 p-4 rounded-md border border-[var(--gray-a5)] hover:border-[var(--indigo-8)] hover:bg-[var(--indigo-a2)] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 w-full">
                    <div className="rounded bg-[var(--indigo-a3)] text-[var(--indigo-11)] p-1.5 group-hover:bg-[var(--indigo-a5)] transition-colors">
                      <Icon size={16} />
                    </div>
                    <Text size="2" weight="medium" className="truncate">
                      {panel.name}
                    </Text>
                  </div>
                  <Text size="1" color="gray" className="leading-snug line-clamp-2">
                    {panel.description}
                  </Text>
                  <div className="flex gap-1 mt-auto">
                    {panel.supports?.map((k) => (
                      <Badge key={k} size="1" variant="soft" color={colorForKind(k)}>
                        {labelForKind(k)}
                      </Badge>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("propel-open-gallery"))}
          className="text-xs text-[var(--gray-11)] hover:text-[var(--indigo-11)] cursor-pointer underline-offset-2 hover:underline mt-2"
        >
          Browse all panels
        </button>
      </div>
    </div>
  );
}

function getComponents(): Record<string, (props: IDockviewPanelProps) => ReactElement> {
  const comps = panelComponents();
  const ret: Record<string, (props: IDockviewPanelProps) => ReactElement> = {};
  for (const [type, Component] of Object.entries(comps)) {
    // Wrap data panels in the unified export frame.
    // Viewers can advertise a crisp SVG via useRegisterExport.
    // If they do not, the frame falls back to a DOM snapshot of [data-export-root].
    // Viewers can opt-out via `genericExport: false`.
    const generic = getPanelByType(type)?.genericExport !== false;
    ret[type] = (props: IDockviewPanelProps) => {
      const content = (
        <div className="h-full w-full overflow-auto">
          <Component {...props} />
        </div>
      );
      return generic ? (
        <ViewerExportFrame
          filename={type}
          onSave={(d, f, m) => backend.saveBytes(d, f, m)}
          style={{ height: "100%", width: "100%" }}
        >
          {content}
        </ViewerExportFrame>
      ) : (
        content
      );
    };
  }
  return ret;
}
