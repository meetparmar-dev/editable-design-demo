import { util, type Canvas, type FabricObject } from "fabric";
import { keepBackgroundAtBack } from "./mutations";

/** Custom props that must survive a serialize → restore round-trip. */
const HISTORY_PROPS = ["designId", "isBackground"];

/**
 * Serialize only the editable text layers — NOT the background.
 *
 * The background is a large data-URL image that never changes, so re-recording
 * it in every history entry would waste a lot of memory. We snapshot just the
 * text layers and leave the background instance in place across undo/redo.
 */
export function snapshot(canvas: Canvas): string {
  const objects = canvas
    .getObjects()
    .filter((o) => !o.isBackground)
    .map((o) => o.toObject(HISTORY_PROPS));
  return JSON.stringify(objects);
}

/**
 * Restore text layers from a snapshot: drop the current editable layers, revive
 * the serialized ones, and re-add them above the untouched background.
 */
export async function restore(canvas: Canvas, json: string): Promise<void> {
  let objects: object[];
  try {
    objects = JSON.parse(json);
  } catch {
    return;
  }

  for (const o of [...canvas.getObjects()]) {
    if (!o.isBackground) canvas.remove(o);
  }

  const revived = (await util.enlivenObjects(objects)) as FabricObject[];
  for (const o of revived) canvas.add(o);

  keepBackgroundAtBack(canvas);
  canvas.discardActiveObject();
  canvas.requestRenderAll();
}
