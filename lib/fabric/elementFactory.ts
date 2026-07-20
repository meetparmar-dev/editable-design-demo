import { Rect, Ellipse, FabricImage } from "fabric";
import type { DesignElement } from "@/types/design";

/**
 * Build an editable Fabric shape (Rect/Ellipse) from a detected element.
 * Position maps 1:1 to image-pixel space, like text (Phase 3 coordinate rule).
 */
export function createShape(el: DesignElement): Rect | Ellipse {
  const common = {
    left: el.x,
    top: el.y,
    originX: "left" as const,
    originY: "top" as const,
    angle: el.rotation,
    fill: el.fill ?? "transparent",
    stroke: el.stroke,
    strokeWidth: el.strokeWidth ?? 0,
    selectable: true,
  };

  const shape =
    el.type === "ellipse"
      ? new Ellipse({ ...common, rx: el.width / 2, ry: el.height / 2 })
      : new Rect({
          ...common,
          width: el.width,
          height: el.height,
          rx: el.cornerRadius ?? 0,
          ry: el.cornerRadius ?? 0,
        });

  shape.designId = el.id;
  return shape;
}

/**
 * Crop a rectangular region out of the source image and return it as a PNG
 * data-URL. Done entirely in the browser via an offscreen canvas — no server
 * round-trip — so logos/icons can be lifted into their own movable layer.
 */
export function cropImageRegion(
  sourceDataUrl: string,
  region: { x: number; y: number; width: number; height: number },
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = Math.max(1, Math.round(region.width));
      const h = Math.max(1, Math.round(region.height));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(img, region.x, region.y, region.width, region.height, 0, 0, w, h);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = sourceDataUrl;
  });
}

/** Build an editable image layer by cropping the element's region out. */
export async function createImageElement(
  el: DesignElement,
  sourceDataUrl: string,
): Promise<FabricImage | null> {
  const cropped = await cropImageRegion(sourceDataUrl, el);
  if (!cropped) return null;

  const img = await FabricImage.fromURL(cropped);
  img.set({
    left: el.x,
    top: el.y,
    originX: "left",
    originY: "top",
    angle: el.rotation,
    selectable: true,
  });
  img.designId = el.id;
  return img;
}
