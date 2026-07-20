/**
 * Core domain types for the editable-design pipeline.
 *
 * These types are the single contract shared across three boundaries:
 *   1. The AI layer  (lib/ai)      — produces a `DesignAnalysis`
 *   2. The Fabric layer (lib/fabric) — turns each `DesignText` into a Textbox
 *   3. The store (store/editorStore) — holds the live editing state
 *
 * Keeping them here (framework-agnostic, no Fabric imports) means the AI
 * response shape never leaks Fabric details, and vice-versa. That separation
 * is what lets us swap Vision-only → Vision+OCR later without touching the UI.
 */

/** Horizontal alignment as returned by the model and consumed by Fabric. */
export type TextAlign = "left" | "center" | "right" | "justify";

/** Intrinsic pixel size of the uploaded image = the canvas world/design space. */
export interface DesignSize {
  width: number;
  height: number;
}

/**
 * A single detected text element, in the image's own pixel coordinate space
 * (origin = top-left of the analyzed image, NOT the canvas).
 *
 * The Fabric factory is responsible for translating these image-space
 * coordinates into canvas-space, so nothing here assumes a canvas exists.
 */
export interface DesignText {
  /** Stable id so React lists / undo-redo can track objects across renders. */
  id: string;
  text: string;
  /** Top-left x in image pixels. */
  x: number;
  /** Top-left y in image pixels. */
  y: number;
  width: number;
  height: number;
  fontSize: number;
  /** Kept as string ("400" | "700" | "bold") to match both CSS and Fabric. */
  fontWeight: string;
  fontFamily: string;
  /** Hex color, e.g. "#ffffff". */
  color: string;
  /** Degrees, clockwise. */
  rotation: number;
  textAlign: TextAlign;
  italic?: boolean;
  underline?: boolean;
  /** Fabric lineHeight multiplier, set for multi-line blocks so wrapped lines
   * match the original spacing (default spacing is too loose). */
  lineHeight?: number;
}

/** Non-text graphic elements we try to lift out of the flattened image. */
export type ElementType = "rectangle" | "ellipse" | "image";

/**
 * A detected non-text element (a shape/button, or a logo/icon extracted as a
 * cropped image). `confidence` (0–1) drives extraction: low-confidence elements
 * are left flattened in the background instead of becoming editable layers.
 */
export interface DesignElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Fill color for shapes (ignored for images). */
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** Corner radius for rectangles. */
  cornerRadius?: number;
  rotation: number;
  /** Model's confidence this is a cleanly separable element, 0–1. */
  confidence: number;
}

/** Raw element as the model returns it — before we assign a stable id. */
export type RawDesignElement = Omit<DesignElement, "id">;

/**
 * The full result of analyzing one uploaded image.
 * `width`/`height` are the analyzed image's intrinsic dimensions — every
 * coordinate is relative to this box.
 */
export interface DesignAnalysis {
  width: number;
  height: number;
  texts: DesignText[];
  elements: DesignElement[];
  /**
   * Tight regions to erase from the background (raw OCR word boxes + element
   * boxes). Kept separate from `texts` because cleaning wants the tightest
   * possible boxes for a smear-free erase, independent of how text is grouped
   * into editable layers.
   */
  maskBoxes: { x: number; y: number; width: number; height: number }[];
}

/** Raw text element as the model returns it — before we assign a stable id. */
export type RawDesignText = Omit<DesignText, "id">;

/** The unvalidated JSON shape we expect back from the Vision model. */
export interface RawDesignAnalysis {
  width: number;
  height: number;
  texts: RawDesignText[];
  elements?: RawDesignElement[];
}
