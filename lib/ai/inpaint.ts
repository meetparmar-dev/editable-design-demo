import type { DesignSize } from "@/types/design";
import type { Box } from "@/lib/fabric/coverPatch";

/** Grow each erase box slightly to fully cover glyph edges + shadows. */
const MASK_PAD = 10;

/**
 * Build the LaMa mask: black canvas with WHITE rectangles over every region to
 * remove. LaMa inpaints the white areas and leaves black areas untouched, so
 * the background outside the text stays pixel-identical.
 */
export function buildMaskDataUrl(size: DesignSize, boxes: Box[]): string {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, size.width, size.height);

  ctx.fillStyle = "white";
  for (const b of boxes) {
    ctx.fillRect(
      b.x - MASK_PAD,
      b.y - MASK_PAD,
      b.width + MASK_PAD * 2,
      b.height + MASK_PAD * 2,
    );
  }

  return canvas.toDataURL("image/png");
}

/**
 * Remove the given regions via the local LaMa (IOPaint) server. Returns a
 * cleaned data-URL, or null on any failure (caller falls back to local fill).
 */
export async function inpaintBackground(
  imageDataUrl: string,
  size: DesignSize,
  boxes: Box[],
): Promise<string | null> {
  if (boxes.length === 0) return null;

  const mask = buildMaskDataUrl(size, boxes);
  if (!mask) return null;

  try {
    const res = await fetch("/api/inpaint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageDataUrl, mask }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.image === "string" ? data.image : null;
  } catch {
    return null;
  }
}
