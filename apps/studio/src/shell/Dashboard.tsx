import { ContextMenu } from "@r4pm/components/ui";
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
import { PiArrowDown, PiArrowLeft, PiArrowRight, PiArrowUp, PiPlus, PiX } from "react-icons/pi";
import { getDockviewApi, setDockviewApi } from "./dockviewApi";
import { useDatasets } from "../stores";
import { ViewerExportFrame } from "@r4pm/components";
import { getPanelByType, panelComponents } from "../panels/registry";
import { backend } from "../backends";
import { getLiveLayout, markLiveLayoutDirty, scheduleSessionSave } from "../persistence/session";
import { useThemeMode } from "./theme-context";
import { WelcomeScreen } from "./WelcomeScreen";
import { ExploreHome } from "./Explore";
import { useExplore } from "../stores/explore";

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

    // Fires on every drag frame: only mark dirty; serialization happens lazily when the layout is read.
    event.api.onDidLayoutChange(() => {
      markLiveLayoutDirty();
      scheduleSessionSave();
    });

    try {
      const saved = getLiveLayout();
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

  const explore = useExplore((s) => s.open);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 min-h-0 relative">
        {explore && (
          <div className="absolute inset-0 z-[60]">
            <ExploreHome />
          </div>
        )}
        <DockviewReact
          defaultRenderer="always"
          theme={resolved === "dark" ? themeDark : themeLight}
          className="w-full h-full"
          onReady={onReady}
          components={dockComponents()}
          watermarkComponent={EmptyPanelsPlaceholder}
          defaultTabComponent={CustomTab}
          rightHeaderActionsComponent={AddTabButton}
        />
      </div>
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
  const [forceWelcome, setForceWelcome] = useState(false);

  useEffect(() => {
    const onShow = () => setForceWelcome(true);
    window.addEventListener("propel-show-welcome", onShow);
    return () => window.removeEventListener("propel-show-welcome", onShow);
  }, []);

  if (datasets.length === 0 || forceWelcome) {
    return <WelcomeScreen canReturn={forceWelcome} onReturn={() => setForceWelcome(false)} />;
  }

  return <ExploreHome />;
}

// Built once: fresh component identities on each render would remount every panel.
let components: ReturnType<typeof getComponents> | undefined;
const dockComponents = () => {
  components ??= getComponents();
  return components;
};

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
