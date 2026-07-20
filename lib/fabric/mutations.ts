import { Textbox, type Canvas, type FabricObject } from "fabric";
import { v4 as uuidv4 } from "uuid";
import type { TextAlign } from "@/types/design";

/**
 * Low-level Fabric operations, kept free of React so they're trivially testable
 * and reusable (toolbar, properties panel, keyboard shortcuts all share them).
 * Each mutation requests a render; callers bump the store's selectionVersion.
 */

/** Type guard — narrows to Textbox so text-only props are safe to touch. */
export function isTextObject(obj: FabricObject | null): obj is Textbox {
  return obj instanceof Textbox;
}

/** Bold is stored as a weight string; treat >=700 (or "bold") as bold. */
export function isBold(obj: Textbox): boolean {
  const w = obj.fontWeight;
  return w === "bold" || Number(w) >= 700;
}

/** Keep the locked background pinned to the bottom after any reorder. */
export function keepBackgroundAtBack(canvas: Canvas) {
  const bg = canvas.getObjects().find((o) => o.isBackground);
  if (bg) canvas.sendObjectToBack(bg);
}

export function toggleBold(canvas: Canvas, obj: FabricObject) {
  if (!isTextObject(obj)) return;
  obj.set("fontWeight", isBold(obj) ? "400" : "700");
  canvas.requestRenderAll();
}

export function toggleItalic(canvas: Canvas, obj: FabricObject) {
  if (!isTextObject(obj)) return;
  obj.set("fontStyle", obj.fontStyle === "italic" ? "normal" : "italic");
  canvas.requestRenderAll();
}

export function toggleUnderline(canvas: Canvas, obj: FabricObject) {
  if (!isTextObject(obj)) return;
  obj.set("underline", !obj.underline);
  canvas.requestRenderAll();
}

export function setFontSize(canvas: Canvas, obj: FabricObject, size: number) {
  if (!isTextObject(obj) || !Number.isFinite(size) || size <= 0) return;
  obj.set("fontSize", size);
  canvas.requestRenderAll();
}

export function setFontFamily(
  canvas: Canvas,
  obj: FabricObject,
  family: string,
) {
  if (!isTextObject(obj) || !family) return;
  obj.set("fontFamily", family);
  canvas.requestRenderAll();
}

export function setFill(canvas: Canvas, obj: FabricObject, color: string) {
  obj.set("fill", color);
  canvas.requestRenderAll();
}

export function setTextAlign(
  canvas: Canvas,
  obj: FabricObject,
  align: TextAlign,
) {
  if (!isTextObject(obj)) return;
  obj.set("textAlign", align);
  canvas.requestRenderAll();
}

export function removeObject(canvas: Canvas, obj: FabricObject) {
  canvas.remove(obj);
  canvas.discardActiveObject();
  canvas.requestRenderAll();
}

/** Clone the object with a small offset and select the copy. */
export async function duplicateObject(
  canvas: Canvas,
  obj: FabricObject,
): Promise<FabricObject> {
  const clone = await obj.clone();
  clone.set({ left: (obj.left ?? 0) + 20, top: (obj.top ?? 0) + 20 });
  clone.designId = uuidv4(); // fresh identity — it's a new layer
  clone.isBackground = false;
  canvas.add(clone);
  keepBackgroundAtBack(canvas);
  canvas.setActiveObject(clone);
  canvas.requestRenderAll();
  return clone;
}

/** Move an object by a delta (keyboard arrow nudge). */
export function nudgeObject(
  canvas: Canvas,
  obj: FabricObject,
  dx: number,
  dy: number,
) {
  obj.set({ left: (obj.left ?? 0) + dx, top: (obj.top ?? 0) + dy });
  obj.setCoords();
  canvas.requestRenderAll();
}

export function bringForward(canvas: Canvas, obj: FabricObject) {
  canvas.bringObjectForward(obj);
  keepBackgroundAtBack(canvas);
  canvas.requestRenderAll();
}

export function sendBackward(canvas: Canvas, obj: FabricObject) {
  canvas.sendObjectBackwards(obj);
  keepBackgroundAtBack(canvas); // never let a layer slip under the background
  canvas.requestRenderAll();
}
