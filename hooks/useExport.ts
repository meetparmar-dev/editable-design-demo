"use client";

import { useEditorStore } from "@/store/editorStore";
import {
  exportCanvas,
  downloadDataUrl,
  type ExportFormat,
} from "@/lib/export/exportCanvas";

/** Exposes the export action, guarded by canvas + design readiness. */
export function useExport() {
  const canvas = useEditorStore((s) => s.canvas);
  const designSize = useEditorStore((s) => s.designSize);

  const canExport = !!canvas && !!designSize;

  const exportAs = (format: ExportFormat) => {
    if (!canvas || !designSize) return;
    const dataUrl = exportCanvas(canvas, designSize, format);
    const ext = format === "jpeg" ? "jpg" : "png";
    downloadDataUrl(dataUrl, `design.${ext}`);
  };

  return { exportAs, canExport };
}
