import { Point, type Canvas } from "fabric";

/** Leave a little breathing room around the design when fitting. */
const DEFAULT_PADDING = 0.9;

/**
 * Scale + center the viewport so a content box (contentWidth × contentHeight,
 * in world/design coordinates) fits inside the canvas.
 *
 * This only changes the *viewport transform* (zoom + pan) — it never touches
 * object coordinates. That's the whole point of Phase 3's coordinate decision:
 * the design lives in image-pixel space, and "fit" is purely a display concern.
 */
export function fitToView(
  canvas: Canvas,
  contentWidth: number,
  contentHeight: number,
  padding = DEFAULT_PADDING,
) {
  if (contentWidth <= 0 || contentHeight <= 0) return;

  const canvasWidth = canvas.getWidth();
  const canvasHeight = canvas.getHeight();

  const zoom =
    Math.min(canvasWidth / contentWidth, canvasHeight / contentHeight) *
    padding;

  // Center the scaled content in the viewport.
  const translateX = (canvasWidth - contentWidth * zoom) / 2;
  const translateY = (canvasHeight - contentHeight * zoom) / 2;

  canvas.setViewportTransform([zoom, 0, 0, zoom, translateX, translateY]);
  canvas.requestRenderAll();
}

/** Reset zoom to 100% while keeping the given world point centered. */
export function resetZoom(canvas: Canvas) {
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  canvas.zoomToPoint(new Point(0, 0), 1);
  canvas.requestRenderAll();
}
