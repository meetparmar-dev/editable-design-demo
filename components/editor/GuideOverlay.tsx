"use client";

import { useEditorStore } from "@/store/editorStore";

/**
 * Renders alignment guide lines as a lightweight HTML overlay (not on the
 * canvas). Drawing in the DOM keeps it retina-safe and avoids fighting Fabric's
 * own upper-canvas rendering. World coordinates are projected to screen pixels
 * via the canvas viewport transform.
 */
export default function GuideOverlay() {
  const guides = useEditorStore((s) => s.guides);
  const canvas = useEditorStore((s) => s.canvas);

  if (!canvas || guides.length === 0) return null;

  const vpt = canvas.viewportTransform; // [a, b, c, d, e, f]

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {guides.map((g, i) => {
        if (g.orientation === "v") {
          const x = g.pos * vpt[0] + vpt[4];
          return (
            <div
              key={`v-${i}`}
              className="absolute top-0 h-full w-px bg-blue-500"
              style={{ left: x }}
            />
          );
        }
        const y = g.pos * vpt[3] + vpt[5];
        return (
          <div
            key={`h-${i}`}
            className="absolute left-0 h-px w-full bg-blue-500"
            style={{ top: y }}
          />
        );
      })}
    </div>
  );
}
