"use client";

import { useEffect, useRef } from "react";
import { Textbox } from "fabric";
import { useEditorStore } from "@/store/editorStore";
import { useObjectActions } from "./useObjectActions";

/**
 * True when the user is typing (a DOM field, or editing a Textbox inline). We
 * must not hijack Delete/arrows/etc. in those cases.
 */
function isTyping(): boolean {
  const el = document.activeElement;
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  ) {
    return true;
  }
  const active = useEditorStore.getState().canvas?.getActiveObject();
  return active instanceof Textbox && active.isEditing;
}

/**
 * Global editor keyboard shortcuts.
 *
 * The handler is stored in a ref and attached once, so it always sees the
 * latest actions/undo/redo without re-binding the listener on every render.
 */
export function useKeyboardShortcuts() {
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const actions = useObjectActions();

  const handlerRef = useRef<(e: KeyboardEvent) => void>(() => {});

  // Keep the handler current with the latest actions/undo/redo without
  // re-binding the window listener. Updating the ref inside an effect (not
  // during render) is the React-correct way to do this.
  useEffect(() => {
    handlerRef.current = (e: KeyboardEvent) => {
      if (isTyping()) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key;

    if (mod && key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
      return;
    }
    if (mod && key.toLowerCase() === "d") {
      e.preventDefault();
      void actions.duplicate();
      return;
    }
    if (mod && key === "]") {
      e.preventDefault();
      actions.bringForward();
      return;
    }
    if (mod && key === "[") {
      e.preventDefault();
      actions.sendBackward();
      return;
    }
    if ((key === "Delete" || key === "Backspace") && actions.hasSelection) {
      e.preventDefault();
      actions.remove();
      return;
    }

    // Arrow-key nudge (Shift = larger step).
    if (
      actions.hasSelection &&
      (key === "ArrowUp" ||
        key === "ArrowDown" ||
        key === "ArrowLeft" ||
        key === "ArrowRight")
    ) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
      const dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
      actions.nudge(dx, dy);
    }
    };
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => handlerRef.current(e);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
