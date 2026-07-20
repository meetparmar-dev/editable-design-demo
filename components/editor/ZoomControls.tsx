"use client";

import { Point } from "fabric";
import { ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { fitToView } from "@/lib/fabric/viewport";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const STEP = 1.2;

/** Floating zoom controls overlaid on the canvas (bottom-left). */
export default function ZoomControls() {
  const canvas = useEditorStore((s) => s.canvas);
  const zoom = useEditorStore((s) => s.zoom);
  const designSize = useEditorStore((s) => s.designSize);
  const setZoom = useEditorStore((s) => s.setZoom);

  const zoomToCenter = (next: number) => {
    if (!canvas) return;
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const center = new Point(canvas.getWidth() / 2, canvas.getHeight() / 2);
    canvas.zoomToPoint(center, clamped);
    setZoom(canvas.getZoom());
  };

  const fit = () => {
    if (!canvas || !designSize) return;
    fitToView(canvas, designSize.width, designSize.height);
    setZoom(canvas.getZoom());
  };

  const disabled = !canvas;

  return (
    <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded-lg border bg-white/95 p-1 shadow-sm backdrop-blur">
      <button
        type="button"
        aria-label="Zoom out"
        disabled={disabled}
        onClick={() => zoomToCenter(zoom / STEP)}
        className="flex h-8 w-8 items-center justify-center rounded text-neutral-700 hover:bg-neutral-100 disabled:text-neutral-300"
      >
        <ZoomOut size={16} />
      </button>
      <span className="w-12 text-center text-xs tabular-nums text-neutral-600">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        aria-label="Zoom in"
        disabled={disabled}
        onClick={() => zoomToCenter(zoom * STEP)}
        className="flex h-8 w-8 items-center justify-center rounded text-neutral-700 hover:bg-neutral-100 disabled:text-neutral-300"
      >
        <ZoomIn size={16} />
      </button>
      <span className="mx-0.5 h-5 w-px bg-neutral-200" />
      <button
        type="button"
        aria-label="Fit to screen"
        disabled={disabled || !designSize}
        onClick={fit}
        className="flex h-8 w-8 items-center justify-center rounded text-neutral-700 hover:bg-neutral-100 disabled:text-neutral-300"
      >
        <Maximize size={16} />
      </button>
    </div>
  );
}
