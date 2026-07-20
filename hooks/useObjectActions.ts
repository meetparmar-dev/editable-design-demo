"use client";

import { useMemo } from "react";
import { Textbox, type Canvas, type FabricObject } from "fabric";
import { useEditorStore } from "@/store/editorStore";
import type { TextAlign } from "@/types/design";
import * as m from "@/lib/fabric/mutations";

/** The live, editable properties of the selected text object. */
export interface TextProps {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  fontSize: number;
  fontFamily: string;
  fill: string;
  textAlign: TextAlign;
}

/**
 * Single bridge between UI (Toolbar + Properties) and Fabric.
 *
 * - Reads the selected object's *live* properties, recomputed whenever
 *   selection changes or selectionVersion bumps (see store).
 * - Exposes bound action callbacks that mutate Fabric then bump the version so
 *   every consumer re-reads the new values.
 */
export function useObjectActions() {
  const canvas = useEditorStore((s) => s.canvas);
  const selected = useEditorStore((s) => s.selected);
  const version = useEditorStore((s) => s.selectionVersion);
  const touch = useEditorStore((s) => s.touchSelected);
  const setSelected = useEditorStore((s) => s.setSelected);

  const isText = selected instanceof Textbox;

  // Recompute derived props when the object or its version changes.
  const props = useMemo<TextProps | null>(() => {
    if (!(selected instanceof Textbox)) return null;
    return {
      bold: m.isBold(selected),
      italic: selected.fontStyle === "italic",
      underline: !!selected.underline,
      fontSize: Math.round(selected.fontSize ?? 0),
      fontFamily: selected.fontFamily ?? "Arial",
      fill: typeof selected.fill === "string" ? selected.fill : "#000000",
      textAlign: (selected.textAlign as TextAlign) ?? "left",
    };
    // `version` is an intentional dependency: it's the signal that `selected`'s
    // mutable fields changed in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, version]);

  /** Run a mutation against the current selection, then notify subscribers. */
  const run = (fn: (c: Canvas, o: FabricObject) => void) => {
    if (!canvas || !selected) return;
    fn(canvas, selected);
    touch();
  };

  return {
    hasSelection: !!selected,
    isText,
    props,

    toggleBold: () => run(m.toggleBold),
    toggleItalic: () => run(m.toggleItalic),
    toggleUnderline: () => run(m.toggleUnderline),
    setFontSize: (n: number) => run((c, o) => m.setFontSize(c, o, n)),
    setFontFamily: (f: string) => run((c, o) => m.setFontFamily(c, o, f)),
    setFill: (color: string) => run((c, o) => m.setFill(c, o, color)),
    setTextAlign: (a: TextAlign) => run((c, o) => m.setTextAlign(c, o, a)),
    bringForward: () => run(m.bringForward),
    sendBackward: () => run(m.sendBackward),
    nudge: (dx: number, dy: number) => run((c, o) => m.nudgeObject(c, o, dx, dy)),

    remove: () => {
      if (!canvas || !selected) return;
      m.removeObject(canvas, selected);
      setSelected(null);
    },
    duplicate: async () => {
      if (!canvas || !selected) return;
      const clone = await m.duplicateObject(canvas, selected);
      setSelected(clone);
    },
  };
}
