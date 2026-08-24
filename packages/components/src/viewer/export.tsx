import {
  createContext,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toJpeg, toPng } from "html-to-image";
import { Button, DropdownMenu, Text } from "@r4pm/components/ui";
import { downloadBlob } from "../dfg/util/svg-export";
import { isDarkMode } from "./dark-mode";

/** `<ViewerExportFrame>` renders the only export control in the package. Viewers advertise a vector
 *  rendering through `useRegisterExport` and the nearest frame turns it into an SVG/PNG/JPEG
 *  download, alongside an html-to-image snapshot of its content (`data-export-root` bounds the
 *  snapshot, `data-export-ignore` drops elements from it). Without a frame `useRegisterExport`
 *  no-ops and nothing is exportable. */

/** A viewer's self-contained vector rendering of its current state. */
export interface VectorExportSource {
  /** Build the current view as a standalone SVG string, or null when not ready; reads live state at
   *  call time (not cached), so async renderers see exact on-screen geometry as of the export click. */
  toSvg: () => string | null | Promise<string | null>;
  /** Menu heading for this source's formats. Defaults to a humanized registration key. */
  label?: string;
  /** Optional extra menu content (e.g., a per-viewer row-limit picker), shown under the heading. */
  menuExtras?: ReactNode;
}

/** Window event fired when an export fails; `detail` carries the message. */
export const EXPORT_ERROR_EVENT = "propel:export-error";

/** Where the export button sits inside the frame. Move it when a viewer has its own corner chrome. */
export type ExportMenuPlacement = "top-right" | "top-left" | "bottom-right" | "bottom-left";

/** A concrete file the menu can produce. */
interface ExportTarget {
  id: string;
  ext: string;
  mime: string;
  /** Raster targets honor the scale factor; vector targets ignore it. */
  raster: boolean;
  render: (opts: { scale: number }) => Promise<Blob>;
}

/** One heading's worth of targets: a registered vector source, or the screenshot fallback. */
interface ExportGroup {
  id: string;
  label: string;
  extras?: ReactNode;
  targets: ExportTarget[];
}

export type SaveBytesFn = (data: Uint8Array, filename: string, mime: string) => void | Promise<void>;

interface RegisteredSource {
  key: string;
  source: VectorExportSource;
}

interface ExportRegistry {
  register: (key: string, source: VectorExportSource) => void;
  unregister: (key: string) => void;
}

const ExportContext = createContext<ExportRegistry | null>(null);

/** Viewer-side: advertise a vector rendering to the surrounding `<ViewerExportFrame>`; no-ops without
 *  one. Pass a stable (memoized or ref-backed) `source` so registration doesn't churn every render.
 *  `key` names the source in the menu and must be unique within a frame. Two viewers sharing a key
 *  collapse into one entry; the viewers' `exportKey` prop is how a host separates them. */
export function useRegisterExport(key: string, source: VectorExportSource | null | undefined): void {
  const ctx = useContext(ExportContext);
  useEffect(() => {
    if (!ctx || !source) return;
    ctx.register(key, source);
    return () => ctx.unregister(key);
  }, [ctx, key, source]);
}

async function browserDownload(data: Uint8Array, filename: string, mime: string): Promise<void> {
  downloadBlob(new Blob([data as BlobPart], { type: mime }), filename);
}

/** Background color for opaque (JPEG) raster output, read from the active theme. */
function themeBackground(): string {
  const probe = document.querySelector(".radix-themes") ?? document.documentElement;
  const fromVar = getComputedStyle(probe).getPropertyValue("--color-background").trim();
  if (fromVar) return fromVar;
  const dark = isDarkMode();
  return dark ? "#111113" : "#ffffff";
}

/** Rasterize an SVG string to a PNG/JPEG blob via a hidden canvas. */
function rasterizeSvg(svg: string, scale: number, mime: "image/png" | "image/jpeg"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas 2d context unavailable"));
        return;
      }
      // JPEG has no alpha, so paint the theme background; PNG keeps it for parity with the app.
      ctx.fillStyle = themeBackground();
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (blob) resolve(blob);
          else reject(new Error("canvas toBlob returned null"));
        },
        mime,
        mime === "image/jpeg" ? 0.92 : undefined,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG image failed to load"));
    };
    img.src = url;
  });
}

/** "oc-declare" -> "Oc declare"; only used when a source registers without an explicit `label`. */
function humanizeKey(key: string): string {
  const spaced = key.replace(/[-_]+/g, " ").trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : key;
}

const PLACEMENT_STYLE: Record<ExportMenuPlacement, CSSProperties> = {
  "top-right": { top: 6, right: 6 },
  "top-left": { top: 6, left: 6 },
  "bottom-right": { bottom: 6, right: 6 },
  "bottom-left": { bottom: 6, left: 6 },
};

export interface ViewerExportFrameProps {
  /** Base name of the downloaded file; the target's extension is appended. */
  filename?: string;
  /** Receive the bytes instead of triggering a browser download (e.g. a native save dialog). */
  onSave?: SaveBytesFn;
  /** Called when an export throws, in addition to the `propel:export-error` window event. */
  onError?: (error: unknown) => void;
  /** The viewer, or any content, to make exportable. The frame is `position: relative` and sizes
   *  nothing on its own; give it a height through `style` and the viewer inside fills it. */
  children: ReactNode;
  style?: CSSProperties;
  /** Show the export control. Off for compact previews; the export context stays active either way. */
  showMenu?: boolean;
  /** Corner the export button sits in. Move it off a viewer's own corner controls. */
  menuPlacement?: ExportMenuPlacement;
}

export function ViewerExportFrame({
  filename = "export",
  onSave,
  onError,
  children,
  style,
  showMenu = true,
  menuPlacement = "top-right",
}: ViewerExportFrameProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [sources, setSources] = useState<RegisteredSource[]>([]);

  const registry = useMemo<ExportRegistry>(
    () => ({
      register: (key, source) =>
        setSources((list) => {
          const i = list.findIndex((s) => s.key === key);
          if (i < 0) return [...list, { key, source }];
          if (list[i].source === source) return list;
          const next = list.slice();
          next[i] = { key, source };
          return next;
        }),
      unregister: (key) =>
        setSources((list) => (list.some((s) => s.key === key) ? list.filter((s) => s.key !== key) : list)),
    }),
    [],
  );

  const save = onSave ?? browserDownload;

  /** The subtree to snapshot; `[data-export-root]` marks it to keep surrounding chrome out of the
   *  image. Falls back to the whole frame when a viewer doesn't mark one. */
  const captureNode = useCallback(
    () => wrapRef.current?.querySelector<HTMLElement>("[data-export-root]") ?? wrapRef.current,
    [],
  );

  const groups = useMemo<ExportGroup[]>(() => {
    const vector = sources.map(({ key, source }): ExportGroup => {
      const svgOrThrow = async () => {
        const svg = await source.toSvg();
        if (!svg)
          throw new Error(`nothing to export (source produced ${svg === null ? "null" : "empty string"})`);
        return svg;
      };
      return {
        id: key,
        label: source.label ?? humanizeKey(key),
        extras: source.menuExtras,
        targets: [
          {
            id: `${key}:svg`,
            ext: "svg",
            mime: "image/svg+xml",
            raster: false,
            render: async () => new Blob([await svgOrThrow()], { type: "image/svg+xml;charset=utf-8" }),
          },
          {
            id: `${key}:png`,
            ext: "png",
            mime: "image/png",
            raster: true,
            render: async ({ scale }) => rasterizeSvg(await svgOrThrow(), scale, "image/png"),
          },
          {
            id: `${key}:jpeg`,
            ext: "jpg",
            mime: "image/jpeg",
            raster: true,
            render: async ({ scale }) => rasterizeSvg(await svgOrThrow(), scale, "image/jpeg"),
          },
        ],
      };
    });

    const snapshot =
      (fn: typeof toPng) =>
      async ({ scale }: { scale: number }) => {
        const node = captureNode();
        if (!node) throw new Error("nothing to export");
        const dataUrl = await fn(node, {
          pixelRatio: scale,
          filter: (n: HTMLElement) => n.dataset?.exportIgnore === undefined,
          backgroundColor: themeBackground(),
        });
        return await (await fetch(dataUrl)).blob();
      };

    return [
      ...vector,
      {
        id: "screenshot",
        label: "Screenshot",
        targets: [
          {
            id: "screenshot:png",
            ext: "png",
            mime: "image/png",
            raster: true,
            render: snapshot(toPng),
          },
          {
            id: "screenshot:jpeg",
            ext: "jpg",
            mime: "image/jpeg",
            raster: true,
            render: snapshot(toJpeg),
          },
        ],
      },
    ];
  }, [sources, captureNode]);

  const run = useCallback(
    async (t: ExportTarget, scale: number) => {
      const blob = await t.render({ scale });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await save(bytes, `${filename}.${t.ext}`, t.mime);
    },
    [save, filename],
  );

  return (
    <ExportContext.Provider value={registry}>
      <div ref={wrapRef} style={{ position: "relative", ...style }}>
        {children}
        {showMenu && <ExportMenu groups={groups} placement={menuPlacement} onPick={run} onError={onError} />}
      </div>
    </ExportContext.Provider>
  );
}

const SCALES = [1, 2, 4] as const;

function ExportMenu({
  groups,
  placement,
  onPick,
  onError,
}: {
  groups: ExportGroup[];
  placement: ExportMenuPlacement;
  onPick: (t: ExportTarget, scale: number) => Promise<void>;
  onError?: (error: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(2);
  const hasRaster = groups.some((g) => g.targets.some((t) => t.raster));
  // A single group is the screenshot fallback alone; its heading names nothing the user must choose.
  const showLabels = groups.length > 1;

  // Items suppress the default close and the menu closes itself on success. A failure keeps the
  // menu open on its error message.
  const pick = async (t: ExportTarget) => {
    setBusy(true);
    setError(null);
    try {
      await onPick(t, scale);
      setOpen(false);
    } catch (err) {
      // A failed vector source (e.g., an async engine whose SVG is not ready) has to be visible.
      // A silent catch turns it into a dead click.
      const message = err instanceof Error ? err.message : String(err);
      console.error("export failed", err);
      setError(message);
      onError?.(err);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(EXPORT_ERROR_EVENT, { detail: message }));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-export-ignore style={{ position: "absolute", zIndex: 20, ...PLACEMENT_STYLE[placement] }}>
      <DropdownMenu.Root open={open} onOpenChange={setOpen}>
        <DropdownMenu.Trigger>
          <Button
            variant="soft"
            size="1"
            loading={busy}
            title={busy ? "Exporting..." : "Export image"}
            aria-label="Export image"
          >
            <DownloadIcon />
            <DropdownMenu.TriggerIcon />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end">
          {hasRaster && (
            <>
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger>
                  Scale{" "}
                  <Text size="1" color="gray" className="ml-1">
                    {scale}x
                  </Text>
                </DropdownMenu.SubTrigger>
                <DropdownMenu.SubContent>
                  <DropdownMenu.RadioGroup
                    value={String(scale)}
                    onValueChange={(v: string) => setScale(Number(v))}
                  >
                    {SCALES.map((s) => (
                      <DropdownMenu.RadioItem
                        key={s}
                        value={String(s)}
                        onSelect={(e: Event) => e.preventDefault()}
                      >
                        {s}x
                      </DropdownMenu.RadioItem>
                    ))}
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.SubContent>
              </DropdownMenu.Sub>
              <DropdownMenu.Separator />
            </>
          )}
          {groups.map((g, gi) => (
            <DropdownMenu.Group key={g.id}>
              {showLabels && <DropdownMenu.Label>{g.label}</DropdownMenu.Label>}
              {g.extras}
              {g.targets.map((t) => (
                <DropdownMenu.Item
                  key={t.id}
                  color="blue"
                  disabled={busy}
                  onSelect={(e: Event) => {
                    e.preventDefault();
                    void pick(t);
                  }}
                >
                  <span className="font-bold w-10">{t.ext.toUpperCase()}</span>
                  <Text size="1" color="gray">
                    {t.raster ? `${scale}x` : "vector"}
                  </Text>
                  <DownloadIcon />
                </DropdownMenu.Item>
              ))}
              {gi < groups.length - 1 && <DropdownMenu.Separator />}
            </DropdownMenu.Group>
          ))}
          {error && (
            <>
              <DropdownMenu.Separator />
              <Text size="1" color="red" as="div" role="alert" className="px-2 py-1 max-w-56">
                Export failed: {error}
              </Text>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      role="img"
      aria-label="Download"
    >
      <title>Download</title>
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
