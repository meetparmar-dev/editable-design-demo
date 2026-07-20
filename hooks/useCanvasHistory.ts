"use client";

import { useEffect, useRef } from "react";
import { useEditorStore } from "@/store/editorStore";
import { snapshot } from "@/lib/fabric/history";

/** Coalesce rapid changes (e.g. typing) into one history entry. */
const DEBOUNCE_MS = 250;

/**
 * Records canvas changes into the undo/redo stacks.
 *
 * - Seeds a baseline snapshot on the first change so the first edit is undoable.
 * - Debounces pushes so a burst of keystrokes/drags becomes one entry.
 * - Skips everything while a restore is in progress (checked via store state),
 *   so undo/redo don't record themselves.
 */
export function useCanvasHistory() {
  const canvas = useEditorStore((s) => s.canvas);
  const pushHistory = useEditorStore((s) => s.pushHistory);
  const resetHistory = useEditorStore((s) => s.resetHistory);

  const seeded = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!canvas) return;
    seeded.current = false;

    const onChange = () => {
      // Never record while the store is restoring a snapshot.
      if (useEditorStore.getState().isRestoring) return;

      if (!seeded.current) {
        seeded.current = true;
        resetHistory(snapshot(canvas));
        return; // baseline captured; the change itself pushes on next tick
      }

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (!useEditorStore.getState().isRestoring) {
          pushHistory(snapshot(canvas));
        }
      }, DEBOUNCE_MS);
    };

    canvas.on("object:added", onChange);
    canvas.on("object:removed", onChange);
    canvas.on("object:modified", onChange);
    canvas.on("text:changed", onChange);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      canvas.off("object:added", onChange);
      canvas.off("object:removed", onChange);
      canvas.off("object:modified", onChange);
      canvas.off("text:changed", onChange);
    };
  }, [canvas, pushHistory, resetHistory]);
}
