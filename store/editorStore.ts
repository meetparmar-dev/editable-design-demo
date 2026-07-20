import { create } from "zustand";
import type { Canvas, FabricObject } from "fabric";
import type { DesignAnalysis, DesignSize } from "@/types/design";
import { restore } from "@/lib/fabric/history";

export type { DesignSize };

/** An alignment guide line, in world (design) coordinates. */
export interface Guide {
  orientation: "v" | "h";
  /** World x (vertical guide) or y (horizontal guide). */
  pos: number;
}

/** Cap history depth to bound memory. */
const MAX_HISTORY = 50;

/**
 * Global editor state.
 *
 * Why a store for the Fabric instance instead of prop-drilling a ref?
 * The canvas is created deep inside <EditorCanvas>, but the Toolbar (top) and
 * Properties panel (right) are siblings that all need to talk to the *same*
 * Fabric instance. A tiny Zustand store is the cleanest way to share one
 * mutable engine across sibling components without a giant context provider or
 * threading refs through every level.
 *
 * The Fabric objects here are intentionally non-serializable live instances —
 * this store is a coordination layer, not persisted state.
 */
interface EditorState {
  canvas: Canvas | null;
  selected: FabricObject | null;
  background: FabricObject | null;
  designSize: DesignSize | null;

  designAnalysis: DesignAnalysis | null;
  detecting: boolean;
  detectError: string | null;

  /**
   * Bumped whenever the selected object mutates in place (toolbar edit, drag,
   * inline text change). Fabric objects are mutable and don't trigger React
   * re-renders on their own, so UI that reads live properties subscribes to
   * this counter to know when to re-read them.
   */
  selectionVersion: number;

  /** Current viewport zoom, mirrored here so zoom UI can react to it. */
  zoom: number;

  /** Active alignment guides while dragging. */
  guides: Guide[];

  // --- Undo/redo ---
  // Stacks live here (not in a hook) so both the Toolbar buttons and the
  // keyboard shortcuts share one source of truth. The top of undoStack is the
  // current state; snapshots contain only text layers (see lib/fabric/history).
  undoStack: string[];
  redoStack: string[];
  /** True while restoring, so change-events don't record the restore itself. */
  isRestoring: boolean;

  setCanvas: (canvas: Canvas | null) => void;
  setSelected: (selected: FabricObject | null) => void;
  touchSelected: () => void;
  setBackground: (
    background: FabricObject | null,
    designSize: DesignSize | null,
  ) => void;
  setDesignAnalysis: (analysis: DesignAnalysis | null) => void;
  setDetecting: (detecting: boolean) => void;
  setDetectError: (error: string | null) => void;

  setZoom: (zoom: number) => void;
  setGuides: (guides: Guide[]) => void;

  /** Seed history with an initial snapshot, clearing all stacks. */
  resetHistory: (initial: string) => void;
  /** Record a new snapshot (no-op while restoring or if unchanged). */
  pushHistory: (snapshot: string) => void;
  undo: () => void;
  redo: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  canvas: null,
  selected: null,
  background: null,
  designSize: null,
  designAnalysis: null,
  detecting: false,
  detectError: null,
  selectionVersion: 0,
  zoom: 1,
  guides: [],
  undoStack: [],
  redoStack: [],
  isRestoring: false,

  setCanvas: (canvas) => set({ canvas }),
  setSelected: (selected) => set({ selected }),
  touchSelected: () =>
    set((s) => ({ selectionVersion: s.selectionVersion + 1 })),
  setBackground: (background, designSize) => set({ background, designSize }),
  setDesignAnalysis: (designAnalysis) => set({ designAnalysis }),
  setDetecting: (detecting) => set({ detecting }),
  setDetectError: (detectError) => set({ detectError }),

  setZoom: (zoom) => set({ zoom }),
  setGuides: (guides) => set({ guides }),

  resetHistory: (initial) =>
    set({ undoStack: [initial], redoStack: [] }),

  pushHistory: (snapshot) => {
    const { isRestoring, undoStack } = get();
    if (isRestoring) return;
    if (undoStack[undoStack.length - 1] === snapshot) return; // no real change
    const next = [...undoStack, snapshot];
    if (next.length > MAX_HISTORY) next.shift();
    set({ undoStack: next, redoStack: [] });
  },

  undo: () => {
    const { undoStack, redoStack, canvas } = get();
    if (undoStack.length <= 1 || !canvas) return;
    const current = undoStack[undoStack.length - 1];
    const previous = undoStack[undoStack.length - 2];
    set({ isRestoring: true, selected: null });
    void restore(canvas, previous).finally(() =>
      set({
        undoStack: undoStack.slice(0, -1),
        redoStack: [...redoStack, current],
        isRestoring: false,
      }),
    );
  },

  redo: () => {
    const { undoStack, redoStack, canvas } = get();
    if (redoStack.length === 0 || !canvas) return;
    const next = redoStack[redoStack.length - 1];
    set({ isRestoring: true, selected: null });
    void restore(canvas, next).finally(() =>
      set({
        undoStack: [...undoStack, next],
        redoStack: redoStack.slice(0, -1),
        isRestoring: false,
      }),
    );
  },
}));
