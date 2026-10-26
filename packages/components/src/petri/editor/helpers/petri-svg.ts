import { flattenColor } from "../../../dfg/util/colors";

/** The active theme's page background, read from the live DOM at export time. */
function exportBackground(): string {
  if (typeof document === "undefined") return "#ffffff";
  const probe = document.querySelector(".radix-themes") ?? document.documentElement;
  const dark =
    document.documentElement.classList.contains("dark") ||
    document.documentElement.getAttribute("data-theme") === "dark" ||
    (probe !== document.documentElement && probe.classList.contains("dark"));
  // Radix vars can be oklch/display-p3, so flatten to an export-safe hex.
  const bg = getComputedStyle(probe).getPropertyValue("--color-background").trim();
  return flattenColor(bg || (dark ? "#111113" : "#ffffff"));
}

// Download / rasterize (browser).

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadSvg(svg: string, filename: string): void {
  downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), filename);
}

/** Rasterize an SVG string to a PNG and download it. */
export function downloadSvgAsPng(svg: string, filename: string, scale = 2): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, img.naturalWidth * scale);
      canvas.height = Math.max(1, img.naturalHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas 2d context unavailable"));
        return;
      }
      ctx.fillStyle = exportBackground();
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) {
          downloadBlob(blob, filename);
          resolve();
        } else reject(new Error("canvas toBlob returned null"));
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG image failed to load"));
    };
    img.src = url;
  });
}
