"use client";

import { useEffect } from "react";
import { useEditorStore } from "@/store/editorStore";
import { setupSnapping } from "@/lib/fabric/snapping";

/** Mounts alignment snapping for the current canvas. */
export function useSnapping() {
  const canvas = useEditorStore((s) => s.canvas);
  const setGuides = useEditorStore((s) => s.setGuides);

  useEffect(() => {
    if (!canvas) return;
    const teardown = setupSnapping(canvas, setGuides);
    return teardown;
  }, [canvas, setGuides]);
}
