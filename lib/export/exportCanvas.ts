import type { Canvas } from "fabric";
import type { DesignSize } from "@/types/design";

export type ExportFormat = "png" | "jpeg";

/** Viewport transform tuple. */
type VPT = [number, number, number, number, number, number];

/**
 * Render the full design to a data-URL at its native resolution.
 *
 * The trick: the on-screen canvas is zoomed/panned and retina-scaled, none of
 * which should affect the exported file. So we temporarily reset the viewport
 * to identity (world coords == pixel coords), crop exactly the design rectangle
 * [0,0 → w,h] at multiplier 1 with retina scaling off, then restore the view.
 * The result is a pixel-exact render of background + text layers.
 */
export function exportCanvas(
  canvas: Canvas,
  size: DesignSize,
  format: ExportFormat,
): string {
  const prevVpt = canvas.viewportTransform
    ? ([...canvas.viewportTransform] as VPT)
    : undefined;

  // Drop selection so no control handles bleed into the render.
  canvas.discardActiveObject();
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);

  const dataUrl = canvas.toDataURL({
    format,
    quality: format === "jpeg" ? 0.92 : 1,
    multiplier: 1,
    left: 0,
    top: 0,
    width: size.width,
    height: size.height,
    enableRetinaScaling: false,
  });

  if (prevVpt) canvas.setViewportTransform(prevVpt);
  canvas.requestRenderAll();

  return dataUrl;
}

/** Trigger a browser download of a data-URL. */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
