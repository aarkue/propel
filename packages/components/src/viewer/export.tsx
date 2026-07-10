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

/**
 * One export control for every viewer.
 *
 * A viewer wrapped in `<ViewerExportFrame>` advertises a vector rendering of itself via
 * `useRegisterExport` (real `<svg>`, not a DOM snapshot); the frame turns that one source into the
 * SVG / PNG / JPEG menu entries (PNG/JPEG are the SVG rasterized client-side, honoring a scale
 * factor). A viewer that registers nothing still exports: the frame falls back to an html-to-image
 * snapshot of its content. Saving goes through the optional `onSave` (so a host can route it to a
 * native save dialog); the default is a browser download (no host wiring needed).
 */

/** A viewer's self-contained vector rendering of its current state. */
export interface VectorExportSource {
  /** Build the current view as a standalone SVG string, or null when not ready. Reads live state
   *  at call time (not cached), so async renderers (e.g. a Rust-engine binding) see the exact
   *  on-screen geometry as of the export click, drag included. */
  toSvg: () => string | null | Promise<string | null>;
  /** Optional extra menu content (e.g. a per-viewer row-limit picker). */
  menuExtras?: ReactNode;
}

/** A concrete file the menu can produce. */
interface ExportTarget {
  id: string;
  label: string;
  ext: string;
  mime: string;
  /** Raster targets honor the scale factor; vector targets ignore it. */
  raster: boolean;
  render: (opts: { scale: number }) => Promise<Blob>;
}

export type SaveBytesFn = (data: Uint8Array, filename: string, mime: string) => void | Promise<void>;

interface ExportRegistry {
  register: (key: string, source: VectorExportSource) => void;
  unregister: (key: string) => void;
}

const ExportContext = createContext<ExportRegistry | null>(null);

/**
 * Viewer-side: advertise a vector rendering to the surrounding `<ViewerExportFrame>`. No-ops when
 * the viewer is mounted without a frame. Pass a stable (memoized or ref-backed) `source` so the
 * registration does not churn every render.
 */
export function useRegisterExport(key: string, source: VectorExportSource | null | undefined): void {
  const ctx = useContext(ExportContext);
  useEffect(() => {
    if (!ctx || !source) return;
    ctx.register(key, source);
    return () => ctx.unregister(key);
  }, [ctx, key, source]);
}

async function browserDownload(data: Uint8Array, filename: string, mime: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Background color for opaque (JPEG) raster output, read from the active theme. */
function themeBackground(): string {
  const probe = document.querySelector(".radix-themes") ?? document.documentElement;
  const fromVar = getComputedStyle(probe).getPropertyValue("--color-background").trim();
  if (fromVar) return fromVar;
  const dark =
    document.documentElement.classList.contains("dark") ||
    document.documentElement.getAttribute("data-theme") === "dark" ||
    document.querySelector(".radix-themes")?.classList.contains("dark") === true;
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

export function ViewerExportFrame({
  filename = "export",
  onSave,
  children,
  style,
  showMenu = true,
}: {
  filename?: string;
  onSave?: SaveBytesFn;
  children: ReactNode;
  style?: CSSProperties;
  /** Show the export control. Off for compact previews; the export context stays active either way. */
  showMenu?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [sources, setSources] = useState<Record<string, VectorExportSource>>({});

  const registry = useMemo<ExportRegistry>(
    () => ({
      register: (key, source) => setSources((s) => ({ ...s, [key]: source })),
      unregister: (key) =>
        setSources((s) => {
          if (!(key in s)) return s;
          const next = { ...s };
          delete next[key];
          return next;
        }),
    }),
    [],
  );

  const save = onSave ?? browserDownload;

  /** The subtree to snapshot when no vector source is registered: the marked content if present,
   *  else the whole frame. Marking `[data-export-root]` keeps surrounding chrome (selectors,
   *  toolbars) out of the image. */
  const captureNode = useCallback(
    () => wrapRef.current?.querySelector<HTMLElement>("[data-export-root]") ?? wrapRef.current,
    [],
  );

  const source = useMemo(() => Object.values(sources)[0], [sources]);

  const targets = useMemo<ExportTarget[]>(() => {
    if (source) {
      const svgOrThrow = async () => {
        const svg = await source.toSvg();
        if (!svg)
          throw new Error(`nothing to export (source produced ${svg === null ? "null" : "empty string"})`);
        return svg;
      };
      return [
        {
          id: "svg",
          label: "SVG (vector)",
          ext: "svg",
          mime: "image/svg+xml",
          raster: false,
          render: async () => new Blob([await svgOrThrow()], { type: "image/svg+xml;charset=utf-8" }),
        },
        {
          id: "png",
          label: "PNG (image)",
          ext: "png",
          mime: "image/png",
          raster: true,
          render: async ({ scale }) => rasterizeSvg(await svgOrThrow(), scale, "image/png"),
        },
        {
          id: "jpeg",
          label: "JPEG (image)",
          ext: "jpg",
          mime: "image/jpeg",
          raster: true,
          render: async ({ scale }) => rasterizeSvg(await svgOrThrow(), scale, "image/jpeg"),
        },
      ];
    }
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
      {
        id: "png",
        label: "PNG (image)",
        ext: "png",
        mime: "image/png",
        raster: true,
        render: snapshot(toPng),
      },
      {
        id: "jpeg",
        label: "JPEG (image)",
        ext: "jpg",
        mime: "image/jpeg",
        raster: true,
        render: snapshot(toJpeg),
      },
    ];
  }, [source, captureNode]);

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
        {showMenu && <ExportMenu targets={targets} extras={source?.menuExtras} onPick={run} />}
      </div>
    </ExportContext.Provider>
  );
}

const SCALES = [1, 2, 4] as const;

function ExportMenu({
  targets,
  extras,
  onPick,
}: {
  targets: ExportTarget[];
  extras?: ReactNode;
  onPick: (t: ExportTarget, scale: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [scale, setScale] = useState(2);
  const hasRaster = targets.some((t) => t.raster);

  const pick = async (t: ExportTarget) => {
    setBusy(true);
    try {
      await onPick(t, scale);
    } catch (err) {
      // Surface instead of silently swallowing, so a failed vector source (e.g. an async
      // engine whose SVG is not ready) is diagnosable rather than a no-op click.
      const message = err instanceof Error ? err.message : String(err);
      console.error("export failed", err);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("propel:export-error", { detail: message }));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-export-ignore style={{ position: "absolute", top: 6, right: 6, zIndex: 20 }}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Button variant="soft" size="1" disabled={busy} title="Export image" aria-label="Export image">
            <DownloadIcon />
            <DropdownMenu.TriggerIcon />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          {extras}
          {hasRaster && (
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
          )}
          {(extras || hasRaster) && <DropdownMenu.Separator />}
          {targets.map((t) => (
            <DropdownMenu.Item key={t.id} color="blue" disabled={busy} onClick={() => void pick(t)}>
              <span className="font-bold w-12">{t.ext.toUpperCase()}</span>
              <DownloadIcon />
            </DropdownMenu.Item>
          ))}
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
