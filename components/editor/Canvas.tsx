"use client";

import { useEffect } from "react";
import { useFabricCanvas } from "@/hooks/useFabricCanvas";
import { useCanvasHistory } from "@/hooks/useCanvasHistory";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useSnapping } from "@/hooks/useSnapping";
import { useEditorStore } from "@/store/editorStore";
import { loadBackground } from "@/lib/fabric/loadBackground";
import { renderDesign } from "@/lib/fabric/renderDesign";
import ZoomControls from "./ZoomControls";
import GuideOverlay from "./GuideOverlay";

/**
 * Canvas host. Owns the Fabric element and composes the editor's cross-cutting
 * behaviors (history, shortcuts, snapping) which all need the live canvas.
 */
export default function EditorCanvas() {
  const { containerRef, canvasElRef } = useFabricCanvas();

  // Cross-cutting behaviors — each mounts its own listeners against the canvas.
  useCanvasHistory();
  useKeyboardShortcuts();
  useSnapping();

  const canvas = useEditorStore((s) => s.canvas);
  const setBackground = useEditorStore((s) => s.setBackground);
  const setZoom = useEditorStore((s) => s.setZoom);
  const designAnalysis = useEditorStore((s) => s.designAnalysis);

  useEffect(() => {
    if (!canvas) return;

    const dataUrl = sessionStorage.getItem("uploaded-image");
    if (!dataUrl) return;

    let cancelled = false;
    loadBackground(canvas, dataUrl)
      .then(({ object, width, height }) => {
        if (cancelled) {
          canvas.remove(object);
          return;
        }
        setBackground(object, { width, height });
        // fitToView changed the zoom — mirror it into the store for the UI.
        setZoom(canvas.getZoom());
      })
      .catch((err) => console.error("Failed to load background image:", err));

    return () => {
      cancelled = true;
    };
  }, [canvas, setBackground, setZoom]);

  // Render detected text + elements as editable Fabric layers whenever
  // detection produces a new analysis. renderDesign keeps the background and
  // clears stale layers; it's async because image elements are cropped.
  useEffect(() => {
    if (!canvas || !designAnalysis) return;
    const dataUrl = sessionStorage.getItem("uploaded-image");
    if (!dataUrl) return;

    let cancelled = false;
    void renderDesign(canvas, designAnalysis, dataUrl).then(() => {
      if (cancelled) return;
    });

    return () => {
      cancelled = true;
    };
  }, [canvas, designAnalysis]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-neutral-200"
    >
      <canvas ref={canvasElRef} />
      <GuideOverlay />
      <ZoomControls />
    </div>
  );
}
