import { Theme } from "@r4pm/components/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { Toaster } from "react-hot-toast";
import { backend } from "../backends";
import { AppViewerConfig } from "./AppViewerConfig";
import { BackendReactContext } from "./backend-context";
import { Dashboard } from "./Dashboard";
import { EngineEvents, refreshArtifacts, refreshDatasets } from "./EngineEvents";
import { ImportProvider } from "./ImportProvider";
import { ThemeProvider, useThemeMode } from "./theme-context";
import { TopBar } from "./TopBar";

// Binding results are immutable per handle and refreshes come from explicit invalidateQueries
// (see EngineEvents / flatten-ocel), so don't re-run expensive bindings on staleness or window focus.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity, refetchOnWindowFocus: false },
  },
});

/** The full studio: backend + theme + query providers wrapping the top bar and dashboard. */
export function SharedRootApp() {
  return (
    <BackendReactContext.Provider value={backend}>
      <ThemeProvider>
        <ThemedBody>
          <QueryClientProvider client={queryClient}>
            <BackendReadyGate>
              <EngineEvents />
              <ImportProvider>
                <AppViewerConfig>
                  <TopBar>
                    <Dashboard />
                  </TopBar>
                </AppViewerConfig>
              </ImportProvider>
            </BackendReadyGate>
          </QueryClientProvider>
        </ThemedBody>
      </ThemeProvider>
    </BackendReactContext.Provider>
  );
}

function ThemedBody({ children }: { children: ReactNode }) {
  const { resolved } = useThemeMode();
  return (
    <Theme
      appearance={resolved}
      accentColor="indigo"
      grayColor="slate"
      scaling="100%"
      radius="small"
      // Solid panels: translucent (default) puts `backdrop-filter: blur(64px)` on every Card/panel
      // surface. WebKitGTK (Linux Tauri webview) renders the whole composited region behind such a
      // panel blurry -> a single radix Card in a pipeline viewer node blurs the entire flow. Solid
      // drops the backdrop-filter entirely (also cheaper to paint).
      panelBackground="solid"
    >
      <Toaster position="bottom-right" />
      {children}
    </Theme>
  );
}

function BackendReadyGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"pending" | "ready" | "error">("pending");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await backend.ready;
      // Initial reconcile of the dataset + artifact stores; live updates handled by <EngineEvents />.
      // The engine keeps state across a webview reload (tauri/webserver), so rehydrate both here.
      await Promise.all([refreshDatasets(), refreshArtifacts()]);
      if (!cancelled) setStatus("ready");
    })().catch((e) => {
      if (cancelled) return;
      setError(String(e));
      setStatus("error");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "ready") return <>{children}</>;

  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 px-8 py-6 rounded-lg bg-[var(--color-panel-solid)] shadow-lg border border-[var(--gray-6)]">
        {status === "pending" ? (
          <>
            <div className="h-8 w-8 rounded-full border-2 border-[var(--indigo-8)] border-t-transparent animate-spin" />
            <div className="text-base font-medium text-[var(--gray-12)]">Setting up backend…</div>
            <div className="text-sm text-[var(--gray-11)]" data-testid="loading">
              Initializing {backend.kind} backend
            </div>
          </>
        ) : (
          <>
            <div className="text-base font-medium text-[var(--red-11)]" data-testid="error">
              Backend failed to initialize
            </div>
            <div className="text-xs text-[var(--gray-11)] max-w-xs text-center break-words">{error}</div>
          </>
        )}
      </div>
    </div>
  );
}
