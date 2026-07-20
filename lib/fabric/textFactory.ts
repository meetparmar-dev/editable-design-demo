import { Textbox } from "fabric";
import type { DesignText } from "@/types/design";

/**
 * Build an editable Fabric.Textbox from one detected DesignText.
 *
 * Textbox (not IText/Text) is deliberate: it honors a fixed `width` and wraps
 * text inside it, which mirrors how the AI reports a bounding box. We set width
 * + fontSize from the detection and let Textbox compute its own height, so the
 * layer stays faithful to the original layout while remaining freely editable.
 *
 * Coordinates map 1:1 because the canvas world is image-pixel space (Phase 3):
 * x/y → left/top, rotation → angle, all with a top-left origin.
 */
export function createTextbox(t: DesignText): Textbox {
  const box = new Textbox(t.text, {
    left: t.x,
    top: t.y,
    width: t.width,
    originX: "left",
    originY: "top",
    fontSize: t.fontSize,
    fontFamily: t.fontFamily,
    fontWeight: t.fontWeight,
    fontStyle: t.italic ? "italic" : "normal",
    underline: t.underline ?? false,
    textAlign: t.textAlign,
    fill: t.color,
    angle: t.rotation,
    // Tighten wrapped-line spacing to the original when detection provides it.
    ...(t.lineHeight ? { lineHeight: t.lineHeight } : {}),
    // Editable + selectable so the user can move, resize, and retype.
    editable: true,
    selectable: true,
  });

  box.designId = t.id;
  return box;
}
