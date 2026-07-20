"use client";

import { useEffect, useRef } from "react";
import { Canvas, Point } from "fabric";
import { useEditorStore } from "@/store/editorStore";

/** Zoom bounds — keep the design usable, prevent runaway wheel zoom. */
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
/** Wheel sensitivity: zoom *= ZOOM_STEP ** -deltaY (Canva-like feel). */
const ZOOM_STEP = 0.999;

/**
 * Owns the entire Fabric canvas lifecycle for one editor mount.
 *
 * Responsibilities kept here (and out of the component) so the engine is
 * reusable and the component stays a thin renderer:
 *   - create / dispose the Fabric canvas (StrictMode double-mount safe)
 *   - high-DPI (retina) rendering
 *   - wheel zoom-to-cursor
 *   - space/alt + drag panning
 *   - responsive sizing via ResizeObserver
 *   - selection events → store
 *
 * Returns two refs: attach `containerRef` to the wrapper div (it defines the
 * canvas size) and `canvasElRef` to the <canvas> element.
 */
export function useFabricCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);

  const setCanvas = useEditorStore((s) => s.setCanvas);
  const setSelected = useEditorStore((s) => s.setSelected);
  const touchSelected = useEditorStore((s) => s.touchSelected);
  const setZoom = useEditorStore((s) => s.setZoom);

  useEffect(() => {
    const containerEl = containerRef.current;
    const canvasEl = canvasElRef.current;
    if (!containerEl || !canvasEl) return;

    const canvas = new Canvas(canvasEl, {
      backgroundColor: "#ffffff",
      // preserveObjectStacking: keep z-order stable when selecting objects —
      // otherwise Fabric pops the selected object to the top visually.
      preserveObjectStacking: true,
      // Retina scaling makes the backing store match devicePixelRatio, so text
      // stays crisp on hi-DPI screens and exports aren't blurry.
      enableRetinaScaling: true,
      width: containerEl.clientWidth,
      height: containerEl.clientHeight,
    });

    setCanvas(canvas);

    // --- Panning state (refs, not React state: no re-render per mouse move) ---
    const isSpaceDown = { current: false };
    const isPanning = { current: false };
    const lastPointer = { current: { x: 0, y: 0 } };

    // --- Wheel zoom-to-cursor ---
    const onWheel = (opt: { e: WheelEvent }) => {
      const e = opt.e;
      let zoom = canvas.getZoom();
      zoom *= ZOOM_STEP ** e.deltaY;
      zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
      // zoomToPoint keeps the point under the cursor fixed while scaling.
      canvas.zoomToPoint(new Point(e.offsetX, e.offsetY), zoom);
      setZoom(zoom);
      e.preventDefault();
      e.stopPropagation();
    };
    canvas.on("mouse:wheel", onWheel);

    // --- Pan: space-or-alt + drag ---
    const onMouseDown = (opt: { e: Event }) => {
      const e = opt.e as MouseEvent;
      if (!isSpaceDown.current && !e.altKey) return;
      isPanning.current = true;
      // Disable object selection while panning so a drag pans instead of
      // rubber-band selecting.
      canvas.selection = false;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      canvas.setCursor("grabbing");
    };
    const onMouseMove = (opt: { e: Event }) => {
      if (!isPanning.current) return;
      const e = opt.e as MouseEvent;
      const { x, y } = lastPointer.current;
      canvas.relativePan(new Point(e.clientX - x, e.clientY - y));
      lastPointer.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => {
      if (!isPanning.current) return;
      isPanning.current = false;
      canvas.selection = true;
    };
    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    canvas.on("mouse:up", onMouseUp);

    // --- Selection → store ---
    const syncSelection = () => setSelected(canvas.getActiveObject() ?? null);
    canvas.on("selection:created", syncSelection);
    canvas.on("selection:updated", syncSelection);
    canvas.on("selection:cleared", () => setSelected(null));

    // Direct-on-canvas edits (drag/resize/rotate ends, inline text change) must
    // also refresh the Properties panel — bump the selection version.
    canvas.on("object:modified", touchSelected);
    canvas.on("text:changed", touchSelected);

    // --- Space key toggles pan mode (ignore while typing in a field) ---
    const isTyping = () => {
      const el = document.activeElement;
      return (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      );
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping()) return;
      if (!isSpaceDown.current) {
        isSpaceDown.current = true;
        canvas.defaultCursor = "grab";
        canvas.setCursor("grab");
      }
      e.preventDefault(); // stop page scroll / button activation
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      isSpaceDown.current = false;
      canvas.defaultCursor = "default";
      canvas.setCursor("default");
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // --- Responsive sizing ---
    const resizeObserver = new ResizeObserver(() => {
      canvas.setDimensions({
        width: containerEl.clientWidth,
        height: containerEl.clientHeight,
      });
      canvas.requestRenderAll();
    });
    resizeObserver.observe(containerEl);

    // --- Teardown: order matters — stop observing, then dispose, then clear store ---
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.dispose();
      setCanvas(null);
      setSelected(null);
    };
  }, [setCanvas, setSelected, touchSelected, setZoom]);

  return { containerRef, canvasElRef };
}
