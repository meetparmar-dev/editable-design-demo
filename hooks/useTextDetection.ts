"use client";

import { useCallback } from "react";
import { useEditorStore } from "@/store/editorStore";
import { analyzeDesign } from "@/lib/ai/analyzeDesign";

/**
 * Encapsulates the "detect text" action + its loading/error lifecycle, so any
 * component (Sidebar button now, Toolbar later) can trigger detection without
 * duplicating the fetch/guard/error plumbing.
 */
export function useTextDetection() {
  const designSize = useEditorStore((s) => s.designSize);
  const detecting = useEditorStore((s) => s.detecting);
  const error = useEditorStore((s) => s.detectError);
  const setDesignAnalysis = useEditorStore((s) => s.setDesignAnalysis);
  const setDetecting = useEditorStore((s) => s.setDetecting);
  const setDetectError = useEditorStore((s) => s.setDetectError);

  const detect = useCallback(async () => {
    if (detecting) return; // guard against double-clicks
    if (!designSize) {
      setDetectError("Upload an image before running detection.");
      return;
    }
    const dataUrl = sessionStorage.getItem("uploaded-image");
    if (!dataUrl) {
      setDetectError("No uploaded image found.");
      return;
    }

    setDetecting(true);
    setDetectError(null);
    try {
      const analysis = await analyzeDesign(dataUrl, designSize);
      setDesignAnalysis(analysis);
    } catch (err) {
      setDetectError(
        err instanceof Error ? err.message : "Detection failed.",
      );
    } finally {
      setDetecting(false);
    }
  }, [
    detecting,
    designSize,
    setDesignAnalysis,
    setDetecting,
    setDetectError,
  ]);

  return { detect, detecting, error, canDetect: !!designSize };
}
