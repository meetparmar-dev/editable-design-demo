import { FabricImage, type Canvas } from "fabric";
import type { DesignAnalysis } from "@/types/design";
import type { Box } from "./coverPatch";
import { createTextbox } from "./textFactory";
import { createShape, createImageElement } from "./elementFactory";
import { buildCleanBackground } from "./cleanBackground";
import { inpaintBackground } from "@/lib/ai/inpaint";
import { keepBackgroundAtBack } from "./mutations";

/**
 * WIP flag: for now detection only erases the original text/buttons and shows
 * the clean background — no editable layers yet (per current requirement). Flip
 * to true to also lay down the editable text/element layers on top.
 */
const ADD_EDITABLE_LAYERS = true;

/**
 * Rebuild the canvas from an analysis. Layer stack, bottom → top:
 *
 *   original image  →  cleaned image (text/buttons erased)  →  [shapes/images → text]
 *
 * The cleaned image sits over the original with every detected region wiped
 * out, so the original text/buttons disappear and only the background shows.
 * Everything but the locked original background is cleared first, so
 * re-detection never stacks duplicates.
 */
export async function renderDesign(
  canvas: Canvas,
  analysis: DesignAnalysis,
  sourceDataUrl: string,
) {
  for (const obj of [...canvas.getObjects()]) {
    if (!obj.isBackground) canvas.remove(obj);
  }

  // Erase every detected region and lay the cleaned image over the original.
  // Primary: local LaMa (IOPaint) — reconstructs the true background pixel-
  // perfectly. Fallback: the local pixel fill, so removal still happens if the
  // LaMa server isn't running.
  const boxes: Box[] = analysis.maskBoxes.map((b) => ({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
  }));
  if (boxes.length > 0) {
    const size = { width: analysis.width, height: analysis.height };
    const cleanUrl =
      (await inpaintBackground(sourceDataUrl, size, boxes)) ??
      (await buildCleanBackground(sourceDataUrl, boxes));
    if (cleanUrl) {
      const cleaned = await FabricImage.fromURL(cleanUrl);
      cleaned.set({
        left: 0,
        top: 0,
        originX: "left",
        originY: "top",
        selectable: false,
        evented: false,
        hoverCursor: "default",
      });
      cleaned.isCover = true;
      canvas.add(cleaned);
    }
  }

  if (ADD_EDITABLE_LAYERS) {
    for (const el of analysis.elements) {
      if (el.type === "image") {
        const img = await createImageElement(el, sourceDataUrl);
        if (img) canvas.add(img);
      } else {
        canvas.add(createShape(el));
      }
    }
    for (const t of analysis.texts) {
      canvas.add(createTextbox(t));
    }
  }

  keepBackgroundAtBack(canvas);
  canvas.requestRenderAll();
}
