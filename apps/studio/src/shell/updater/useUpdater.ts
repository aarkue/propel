import { useCallback, useEffect, useRef, useState } from "react";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";

declare const __APP_VERSION__: string;

/** Only the desktop (Tauri) build ships the updater plugin; web/wasm builds just show the version. */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Dev-only: `VITE_MOCK_UPDATE=1 pnpm dev` fakes an available update to exercise the whole flow in the browser. */
const MOCK = import.meta.env.VITE_MOCK_UPDATE === "1";

/** A fake Update whose download/install resolve over timers, so the dialog flow runs without Tauri or a server. */
function makeMockUpdate(): Update {
  const total = 8 * 1024 * 1024;
  const chunk = total / 20;
  return {
    version: "0.2.0-mock",
    currentVersion: __APP_VERSION__,
    body: "Mock release notes:\n- Simulated update for local UI testing\n- Not a real release",
    async download(onEvent?: (ev: DownloadEvent) => void) {
      onEvent?.({ event: "Started", data: { contentLength: total } });
      await new Promise<void>((resolve) => {
        let sent = 0;
        const id = setInterval(() => {
          sent += chunk;
          onEvent?.({ event: "Progress", data: { chunkLength: chunk } });
          if (sent >= total) {
            clearInterval(id);
            onEvent?.({ event: "Finished" });
            resolve();
          }
        }, 150);
      });
    },
    async install() {
      await new Promise((r) => setTimeout(r, 800));
    },
    async close() {},
  } as unknown as Update;
}

export type UpdateStatus =
  | { state: "initial" }
  | { state: "downloading"; downloaded: number; contentLength?: number }
  | { state: "downloaded" }
  | { state: "installing" }
  | { state: "installed" }
  | { state: "restarting" }
  | { state: "error"; message: string };

/**
 * Whether an update check ran and its outcome. `unsupported` = web/wasm (no updater);
 * `checking` = in flight; `done` = completed (up to date if `available` is null);
 * `failed` = check errored (offline / unpublished release), so we must NOT claim "latest".
 */
export type CheckState = "unsupported" | "checking" | "done" | "failed";

export interface Updater {
  /** Current app version (getVersion() in Tauri, build-time fallback otherwise). */
  version: string;
  /** The pending update, or null when up to date / not checked. */
  available: Update | null;
  checkState: CheckState;
  status: UpdateStatus;
  startDownload: () => void;
  install: () => void;
  restart: () => void;
  reset: () => void;
}

/**
 * Checks for a desktop update on mount and drives the download -> install -> restart flow.
 * The Tauri plugins are dynamically imported so they are code-split out of the web/wasm bundles.
 */
export function useUpdater(): Updater {
  const [version, setVersion] = useState<string>(__APP_VERSION__);
  const [available, setAvailable] = useState<Update | null>(null);
  const [checkState, setCheckState] = useState<CheckState>(isTauri && !MOCK ? "checking" : "unsupported");
  const [status, setStatus] = useState<UpdateStatus>({ state: "initial" });
  const updateRef = useRef<Update | null>(null);

  useEffect(() => {
    if (MOCK) {
      const mock = makeMockUpdate();
      updateRef.current = mock;
      setAvailable(mock);
      return;
    }
    if (!isTauri) return;
    let cancelled = false;
    void (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const v = await getVersion();
        if (!cancelled) setVersion(v);
      } catch {
        // keep the build-time fallback version
      }
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (!cancelled) {
          if (update) {
            updateRef.current = update;
            setAvailable(update);
          }
          setCheckState("done");
        }
      } catch (e) {
        // offline or updater not yet configured for this release: don't claim "latest"
        if (!cancelled) setCheckState("failed");
        console.warn("Update check failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startDownload = useCallback(() => {
    const update = updateRef.current;
    if (!update) return;
    setStatus({ state: "downloading", downloaded: 0 });
    update
      .download((ev: DownloadEvent) => {
        if (ev.event === "Started") {
          setStatus({ state: "downloading", downloaded: 0, contentLength: ev.data.contentLength });
        } else if (ev.event === "Progress") {
          setStatus((s) =>
            s.state === "downloading" ? { ...s, downloaded: s.downloaded + ev.data.chunkLength } : s,
          );
        } else if (ev.event === "Finished") {
          setStatus({ state: "downloaded" });
        }
      })
      .catch((e: unknown) => setStatus({ state: "error", message: String(e) }));
  }, []);

  const install = useCallback(() => {
    const update = updateRef.current;
    if (!update) return;
    setStatus({ state: "installing" });
    update
      .install()
      .then(() => setStatus({ state: "installed" }))
      .catch((e: unknown) => setStatus({ state: "error", message: String(e) }));
  }, []);

  const restart = useCallback(() => {
    setStatus({ state: "restarting" });
    if (MOCK) {
      setTimeout(() => {
        setVersion(updateRef.current?.version ?? __APP_VERSION__);
        updateRef.current = null;
        setAvailable(null);
        setStatus({ state: "initial" });
      }, 800);
      return;
    }
    void (async () => {
      try {
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
        // app exits here on success
      } catch (e) {
        setStatus({ state: "error", message: String(e) });
      }
    })();
  }, []);

  const reset = useCallback(() => setStatus({ state: "initial" }), []);

  return { version, available, checkState, status, startDownload, install, restart, reset };
}
