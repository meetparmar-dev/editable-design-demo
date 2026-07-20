import { v4 as uuidv4 } from "uuid";
import type {
  DesignAnalysis,
  DesignText,
  DesignElement,
  ElementType,
  DesignSize,
  TextAlign,
} from "@/types/design";
import { detectOCR, sampleTextColor, type OcrBox } from "./ocr";
import { loadImageData, type Box } from "@/lib/fabric/coverPatch";
import { refineTextBox } from "./textRegions";
import { detectModelOCR, type ModelTextBox } from "./modelOcr";

/**
 * The single boundary the UI knows about for design detection.
 *
 * Goal: the text ALREADY in the image should become editable *in place* — same
 * spot, same size, same color — so it reads as "the original text became
 * editable", not "a new layer was added". Sources, in order of trust:
 *
 *   - EasyOCR model (/api/ocr) → accurate per-line boxes on ANY background
 *     (gradients, photos, low contrast). PRIMARY geometry.
 *   - Vision (gpt-4o)          → clean text content; recovers text the model
 *     misses. Corrects each box's string; unmatched Vision text kept as-is.
 *   - pixel sampling           → the real text color.
 *
 * Fallbacks when the model server is down: Vision boxes refined by a local-
 * background pixel snap, then OCR (Tesseract) lines. renderDesign then erases
 * the originals (LaMa) under the editable layers.
 */
export async function analyzeDesign(
  imageDataUrl: string,
  size: DesignSize,
): Promise<DesignAnalysis> {
  const [ocr, vision, imageData, modelBoxes] = await Promise.all([
    detectOCR(imageDataUrl),
    fetchVision(imageDataUrl, size),
    loadImageData(imageDataUrl),
    detectModelOCR(imageDataUrl),
  ]);

  // Model boxes are the accurate geometry; Vision cleans the content. Only when
  // the model server is unavailable do we fall back to the Vision-pixel refine,
  // then to OCR lines.
  const texts =
    modelBoxes.length > 0
      ? buildTextsFromModel(modelBoxes, vision.texts, imageData)
      : vision.texts.length > 0
        ? refineVisionTexts(vision.texts, imageData)
        : linesToTexts(ocr.lines, imageData);

  // Erase regions: union of EVERY source for maximum coverage — OCR words
  // (tight), merged text boxes (Vision recall, catches low-contrast text OCR
  // misses like badges), and element boxes (buttons/logos). Broader mask hides
  // more; a little smear is an acceptable trade for fully hiding the text.
  const maskBoxes = [
    ...ocr.words.map((w) => ({ x: w.x, y: w.y, width: w.width, height: w.height })),
    ...texts.map((t) => ({ x: t.x, y: t.y, width: t.width, height: t.height })),
    ...vision.elements.map((e) => ({
      x: e.x,
      y: e.y,
      width: e.width,
      height: e.height,
    })),
  ];

  return {
    width: size.width,
    height: size.height,
    texts,
    elements: vision.elements,
    maskBoxes,
  };
}

// --- Vision → text content + elements ---------------------------------------

/** The Vision model returns geometry on this normalized square grid. */
const NORM = 1000;
const CONFIDENCE_THRESHOLD = 0.6;
/** Drop OCR lines below this when Vision is unavailable (0–100). */
const MIN_LINE_CONFIDENCE = 55;

async function fetchVision(
  imageDataUrl: string,
  size: DesignSize,
): Promise<{ texts: DesignText[]; elements: DesignElement[] }> {
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: imageDataUrl,
        width: size.width,
        height: size.height,
      }),
    });
    if (!res.ok) return { texts: [], elements: [] };

    const raw: unknown = await res.json();
    const obj = (raw ?? {}) as Record<string, unknown>;
    const scale: Scale = { sx: size.width / NORM, sy: size.height / NORM };

    const texts = (Array.isArray(obj.texts) ? obj.texts : [])
      .map((t) => normalizeText(t, scale))
      .filter((t): t is DesignText => t !== null);
    const elements = (Array.isArray(obj.elements) ? obj.elements : [])
      .map((e) => normalizeElement(e, scale))
      .filter((e): e is DesignElement => e !== null);

    return { texts, elements };
  } catch {
    return { texts: [], elements: [] };
  }
}

// --- Hybrid merge: snap Vision text onto OCR boxes ---------------------------

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeWord(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Build editable texts by GROUPING the model's per-line boxes into Vision's
 * logical blocks. Vision decides what belongs together (a 2-line heading, a
 * 3-line paragraph = one editable object with the clean full string); EasyOCR
 * supplies the exact line boxes, whose union is the block's geometry so a
 * wrapped Textbox re-lays the same lines. Font size comes from the per-line
 * height (not the block height) so wrapping matches. Any model line no Vision
 * block claims is text Vision missed → added on its own; any Vision block with
 * no model lines keeps Vision's approximate box.
 */
function buildTextsFromModel(
  modelBoxes: ModelTextBox[],
  visionTexts: DesignText[],
  imageData: ImageData | null,
): DesignText[] {
  const lines = modelBoxes.filter((b) => b.confidence >= 0.3 && b.text.trim().length > 0);
  const claimed = new Set<number>();
  const out: DesignText[] = [];

  // 1. One editable text per Vision block = union of the model lines it owns.
  for (const vt of visionTexts) {
    const vTokens = new Set(tokenize(vt.text).map(normalizeWord).filter(Boolean));
    const owned = lines.filter((b, i) => {
      if (claimed.has(i)) return false;
      const bt = tokenize(b.text).map(normalizeWord).filter(Boolean);
      if (bt.length === 0) return false;
      const hits = bt.filter((t) => vTokens.has(t)).length;
      return hits >= Math.max(1, Math.ceil(bt.length * 0.5));
    });

    if (owned.length === 0) {
      out.push(vt); // Vision saw it, model didn't → keep Vision's box
      continue;
    }
    owned.forEach((b) => claimed.add(lines.indexOf(b)));

    const merged = unionBox(owned);
    const style = imageData
      ? sampleTextColor(imageData, merged)
      : { color: "#000000", bold: false };
    out.push({
      ...vt,
      x: merged.x,
      y: merged.y,
      width: merged.width,
      height: merged.height,
      // Per-line height (not the multi-line block height) so the wrapped
      // Textbox renders lines at the original size.
      fontSize: Math.max(1, Math.round(median(owned.map((b) => b.height)) * 0.9)),
      color: style.color,
      fontWeight: style.bold ? "700" : vt.fontWeight,
    });
  }

  // 2. Model lines no Vision block owned → text Vision missed; keep each alone.
  lines.forEach((b, i) => {
    if (claimed.has(i)) return;
    const box: Box = { x: b.x, y: b.y, width: b.width, height: b.height };
    const style = imageData
      ? sampleTextColor(imageData, box)
      : { color: "#000000", bold: false };
    out.push({
      id: uuidv4(),
      text: b.text,
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      fontSize: Math.max(1, Math.round(b.height * 0.9)),
      fontWeight: style.bold ? "700" : "400",
      fontFamily: "Arial",
      color: style.color,
      rotation: 0,
      textAlign: "left" as TextAlign,
    });
  });

  return out;
}

/** Smallest box enclosing all the given boxes. */
function unionBox(boxes: { x: number; y: number; width: number; height: number }[]): Box {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Snap each Vision text onto the real glyphs via a local-background pixel refine
 * (see refineTextBox). A confident refine gives exact position + size + sampled
 * color + per-line font size; an inconclusive one (busy/low-contrast area) keeps
 * Vision's own box so we never make a text worse than Vision had it.
 */
function refineVisionTexts(
  visionTexts: DesignText[],
  imageData: ImageData | null,
): DesignText[] {
  if (!imageData) return visionTexts;

  return visionTexts.map((vt) => {
    const box: Box = { x: vt.x, y: vt.y, width: vt.width, height: vt.height };
    const refined = refineTextBox(imageData, box);
    if (!refined) return vt;

    const style = sampleTextColor(imageData, refined);
    return {
      ...vt,
      x: refined.x,
      y: refined.y,
      width: refined.width,
      height: refined.height,
      // Per-line height ≈ font size for one line; whole-block height would blow
      // up multi-line paragraphs, so we use the median line band.
      fontSize: Math.max(1, Math.round(refined.lineHeight * 0.92)),
      color: style.color,
      fontWeight: style.bold ? "700" : vt.fontWeight,
    };
  });
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function mergeTexts(
  visionTexts: DesignText[],
  words: OcrBox[],
  imageData: ImageData | null,
): DesignText[] {
  const used = new Set<number>();

  return visionTexts.map((vt) => {
    const tokens = tokenize(vt.text);
    if (tokens.length === 0) return vt;

    const matched: OcrBox[] = [];
    for (const tok of tokens) {
      for (let i = 0; i < words.length; i++) {
        if (used.has(i)) continue;
        const wt = normalizeWord(words[i].text);
        if (!wt) continue;
        if (wt === tok || wt.includes(tok) || tok.includes(wt)) {
          used.add(i);
          matched.push(words[i]);
          break;
        }
      }
    }

    // Need at least half the words matched to trust the OCR geometry.
    if (matched.length < Math.max(1, Math.ceil(tokens.length * 0.5))) {
      return vt; // keep Vision's approximate box
    }

    const x0 = Math.min(...matched.map((b) => b.x));
    const y0 = Math.min(...matched.map((b) => b.y));
    const x1 = Math.max(...matched.map((b) => b.x + b.width));
    const y1 = Math.max(...matched.map((b) => b.y + b.height));
    const box: Box = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    const style = imageData ? sampleTextColor(imageData, box) : null;

    return {
      ...vt,
      x: x0,
      y: y0,
      width: box.width,
      height: box.height,
      // Per-line glyph height from OCR, not Vision's guess.
      fontSize: Math.max(1, Math.round(median(matched.map((b) => b.height)) * 0.92)),
      color: style?.color ?? vt.color,
      fontWeight: style?.bold ? "700" : vt.fontWeight,
    };
  });
}

/** Fallback when Vision is unavailable: build text straight from OCR lines. */
function linesToTexts(lines: OcrBox[], imageData: ImageData | null): DesignText[] {
  return lines
    .filter((l) => l.confidence >= MIN_LINE_CONFIDENCE && l.text)
    .map((l) => {
      const box: Box = { x: l.x, y: l.y, width: l.width, height: l.height };
      const style = imageData
        ? sampleTextColor(imageData, box)
        : { color: "#000000", bold: false };
      return {
        id: uuidv4(),
        text: l.text,
        x: l.x,
        y: l.y,
        width: l.width,
        height: l.height,
        fontSize: Math.max(1, Math.round(l.height * 0.92)),
        fontWeight: style.bold ? "700" : "400",
        fontFamily: "Arial",
        color: style.color,
        rotation: 0,
        textAlign: "left" as TextAlign,
      };
    });
}

// --- Defensive normalization -------------------------------------------------

const ALIGNMENTS: readonly TextAlign[] = ["left", "center", "right", "justify"];
const ELEMENT_TYPES: readonly ElementType[] = ["rectangle", "ellipse", "image"];

interface Scale {
  sx: number;
  sy: number;
}

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toStr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function toAlign(value: unknown): TextAlign {
  return ALIGNMENTS.includes(value as TextAlign) ? (value as TextAlign) : "left";
}

function toColor(value: unknown): string {
  return typeof value === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)
    ? value
    : "#000000";
}

function normalizeText(raw: unknown, { sx, sy }: Scale): DesignText | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const text = typeof t.text === "string" ? t.text.trim() : "";
  if (!text) return null;

  return {
    id: uuidv4(),
    text,
    x: toNumber(t.x, 0) * sx,
    y: toNumber(t.y, 0) * sy,
    width: Math.max(1, toNumber(t.width, 0) * sx),
    height: Math.max(1, toNumber(t.height, 0) * sy),
    fontSize: Math.max(1, toNumber(t.fontSize, 24) * sy),
    fontWeight: toStr(t.fontWeight, "400"),
    fontFamily: toStr(t.fontFamily, "Arial"),
    color: toColor(t.color),
    rotation: toNumber(t.rotation, 0),
    textAlign: toAlign(t.textAlign),
    italic: t.italic === true,
    underline: t.underline === true,
  };
}

function normalizeElement(raw: unknown, { sx, sy }: Scale): DesignElement | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;

  const type = ELEMENT_TYPES.includes(e.type as ElementType)
    ? (e.type as ElementType)
    : null;
  if (!type) return null;

  const confidence = toNumber(e.confidence, 0);
  if (confidence < CONFIDENCE_THRESHOLD) return null;

  const width = Math.max(1, toNumber(e.width, 0) * sx);
  const height = Math.max(1, toNumber(e.height, 0) * sy);
  if (width <= 1 || height <= 1) return null;

  return {
    id: uuidv4(),
    type,
    x: toNumber(e.x, 0) * sx,
    y: toNumber(e.y, 0) * sy,
    width,
    height,
    fill: typeof e.fill === "string" ? toColor(e.fill) : undefined,
    stroke: typeof e.stroke === "string" ? toColor(e.stroke) : undefined,
    strokeWidth:
      e.strokeWidth != null ? toNumber(e.strokeWidth, 0) * sx : undefined,
    cornerRadius:
      e.cornerRadius != null
        ? Math.max(0, toNumber(e.cornerRadius, 0) * sx)
        : undefined,
    rotation: toNumber(e.rotation, 0),
    confidence,
  };
}
