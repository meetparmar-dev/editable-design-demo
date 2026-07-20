import { FabricImage, type Canvas } from "fabric";
import { fitToView } from "./viewport";

export interface LoadedBackground {
  object: FabricImage;
  /** Intrinsic pixel size — becomes the design coordinate space. */
  width: number;
  height: number;
}

/**
 * Load an image (data-URL) into the canvas as a fully-locked background layer.
 *
 * Coordinate decision (the crux of Phase 3): the image is placed at world
 * origin (0,0) with scale 1, so it occupies world coordinates [0,0 → w,h].
 * That makes the canvas world = the image's own pixels, so AI-detected text at
 * "x:120, y:90" later maps to left:120, top:90 with zero conversion.
 */
export async function loadBackground(
  canvas: Canvas,
  dataUrl: string,
): Promise<LoadedBackground> {
  const image = await FabricImage.fromURL(dataUrl);

  const width = image.width ?? 0;
  const height = image.height ?? 0;

  image.set({
    left: 0,
    top: 0,
    originX: "left",
    originY: "top",
    // Fully inert: can't select, click, hover-highlight, move, or resize it.
    selectable: false,
    evented: false,
    hasControls: false,
    hasBorders: false,
    lockMovementX: true,
    lockMovementY: true,
    hoverCursor: "default",
  });
  // Tag it so text rendering / export can distinguish the background from
  // editable layers without a separate reference.
  image.isBackground = true;

  canvas.add(image);
  // Guarantee it sits beneath every text layer we add later.
  canvas.sendObjectToBack(image);

  // World = image pixels, so fit against the image's own dimensions.
  fitToView(canvas, width, height);

  return { object: image, width, height };
}
