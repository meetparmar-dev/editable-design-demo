import type { Canvas, FabricObject } from "fabric";
import type { Guide } from "@/store/editorStore";

/** Snap distance in *screen* pixels (converted to world units via zoom). */
const THRESHOLD_PX = 6;

interface Edges {
  l: number;
  t: number;
  r: number;
  b: number;
  cx: number;
  cy: number;
}

function edgesOf(o: FabricObject): Edges {
  const l = o.left ?? 0;
  const t = o.top ?? 0;
  const w = o.getScaledWidth();
  const h = o.getScaledHeight();
  return { l, t, r: l + w, b: t + h, cx: l + w / 2, cy: t + h / 2 };
}

/**
 * Alignment snapping with visual guides.
 *
 * While an object moves we compare its left/center/right (and top/center/
 * bottom) against every other object — including the background, which gives us
 * "snap to the design's edges and center" for free. The first anchor within
 * threshold wins per axis: we nudge the object into exact alignment and emit a
 * guide line for the overlay to draw. Guides clear when the drag ends.
 *
 * Returns a cleanup function that detaches all listeners.
 */
export function setupSnapping(
  canvas: Canvas,
  setGuides: (guides: Guide[]) => void,
): () => void {
  const clear = () => setGuides([]);

  const onMoving = (e: { target?: FabricObject }) => {
    const obj = e.target;
    if (!obj) return;

    const threshold = THRESHOLD_PX / canvas.getZoom();
    const m = edgesOf(obj);
    const others = canvas.getObjects().filter((o) => o !== obj);

    const xTargets: number[] = [];
    const yTargets: number[] = [];
    for (const o of others) {
      const ed = edgesOf(o);
      xTargets.push(ed.l, ed.cx, ed.r);
      yTargets.push(ed.t, ed.cy, ed.b);
    }

    const guides: Guide[] = [];

    // --- X axis: snap left / center / right ---
    for (const val of [m.l, m.cx, m.r]) {
      const hit = xTargets.find((tx) => Math.abs(val - tx) <= threshold);
      if (hit !== undefined) {
        obj.set("left", (obj.left ?? 0) + (hit - val));
        guides.push({ orientation: "v", pos: hit });
        break;
      }
    }

    // --- Y axis: snap top / center / bottom ---
    for (const val of [m.t, m.cy, m.b]) {
      const hit = yTargets.find((ty) => Math.abs(val - ty) <= threshold);
      if (hit !== undefined) {
        obj.set("top", (obj.top ?? 0) + (hit - val));
        guides.push({ orientation: "h", pos: hit });
        break;
      }
    }

    obj.setCoords();
    setGuides(guides);
  };

  canvas.on("object:moving", onMoving);
  canvas.on("mouse:up", clear);
  canvas.on("object:modified", clear);
  canvas.on("selection:cleared", clear);

  return () => {
    canvas.off("object:moving", onMoving);
    canvas.off("mouse:up", clear);
    canvas.off("object:modified", clear);
    canvas.off("selection:cleared", clear);
  };
}
