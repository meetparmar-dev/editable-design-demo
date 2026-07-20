"use client";

import {
  Layers,
  Loader2,
  ScanText,
  Type,
  Square,
  Circle,
  Image as ImageIcon,
} from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { useTextDetection } from "@/hooks/useTextDetection";
import type { ElementType } from "@/types/design";

function ElementIcon({ type }: { type: ElementType }) {
  const size = 14;
  const cls = "shrink-0 text-neutral-400";
  if (type === "ellipse") return <Circle size={size} className={cls} />;
  if (type === "image") return <ImageIcon size={size} className={cls} />;
  return <Square size={size} className={cls} />;
}

/**
 * Left sidebar — detection trigger + layers list.
 *
 * The list here is currently read-only (a preview of what the AI found). In
 * Phase 5 these same detected texts become real Fabric.Textbox layers and this
 * list becomes the selectable layers panel.
 */
export default function Sidebar() {
  const { detect, detecting, error, canDetect } = useTextDetection();
  const analysis = useEditorStore((s) => s.designAnalysis);
  const canvas = useEditorStore((s) => s.canvas);
  const selected = useEditorStore((s) => s.selected);
  const setSelected = useEditorStore((s) => s.setSelected);
  const texts = analysis?.texts ?? [];
  const elements = analysis?.elements ?? [];
  const isEmpty = texts.length === 0 && elements.length === 0;

  // Clicking a layer selects the matching Textbox on the canvas. Fabric doesn't
  // emit selection events for programmatic setActiveObject, so we sync the store
  // ourselves to keep the highlight in sync.
  const selectLayer = (id: string) => {
    if (!canvas) return;
    const obj = canvas.getObjects().find((o) => o.designId === id);
    if (!obj) return;
    canvas.setActiveObject(obj);
    canvas.requestRenderAll();
    setSelected(obj);
  };

  return (
    <aside className="flex w-64 flex-col border-r bg-white">
      <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium text-neutral-700">
        <Layers size={16} />
        Layers
      </div>

      <div className="border-b p-3">
        <button
          type="button"
          onClick={detect}
          disabled={!canDetect || detecting}
          className="flex w-full items-center justify-center gap-2 rounded bg-neutral-900 px-3 py-2 text-sm text-white transition-opacity disabled:opacity-40"
        >
          {detecting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Detecting…
            </>
          ) : (
            <>
              <ScanText size={16} />
              Detect Text
            </>
          )}
        </button>
        {error && (
          <p className="mt-2 text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isEmpty ? (
          <p className="p-2 text-center text-sm text-neutral-400">
            {canDetect
              ? "Nothing detected yet. Run detection."
              : "Upload an image to begin."}
          </p>
        ) : (
          <ul className="space-y-1">
            {texts.map((t) => {
              const isActive = selected?.designId === t.id;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => selectLayer(t.id)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                      isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-neutral-700 hover:bg-neutral-100"
                    }`}
                    title={`${t.fontFamily} · ${t.fontSize}px · ${t.color}`}
                  >
                    <Type
                      size={14}
                      className={`shrink-0 ${
                        isActive ? "text-blue-500" : "text-neutral-400"
                      }`}
                    />
                    <span className="truncate">{t.text}</span>
                  </button>
                </li>
              );
            })}

            {elements.map((el) => {
              const isActive = selected?.designId === el.id;
              return (
                <li key={el.id}>
                  <button
                    type="button"
                    onClick={() => selectLayer(el.id)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                      isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-neutral-700 hover:bg-neutral-100"
                    }`}
                    title={`${el.type} · ${Math.round(el.confidence * 100)}% confidence`}
                  >
                    <ElementIcon type={el.type} />
                    <span className="truncate capitalize">{el.type}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
