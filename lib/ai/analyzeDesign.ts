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

/**
 * The single boundary the UI knows about for design detection.
 *
 * Goal: the text ALREADY in the image should become editable *in place* — same
 * spot, same size, same color — so it reads as "the original text became
 * editable", not "a new layer was added". We get there with a hybrid:
 *
 *   - OCR (Tesseract)  → pixel-exact boxes & sizes  (good geometry, weak recall)
 *   - Vision (gpt-4o)  → the actual text content & font  (full recall)
 *   - pixel sampling   → the real color
 *
 * We take Vision's text list and snap each block onto the OCR boxes that match
 * it word-for-word. Matched → exact geometry + sampled color. Unmatched → keep
 * Vision's approximate box (better than dropping the text). If Vision is
 * unavailable, we fall back to OCR lines alone. A cover patch (renderDesign)
 * then hides the original underneath.
 */
export async function analyzeDesign(
  imageDataUrl: string,
  size: DesignSize,
): Promise<DesignAnalysis> {
  const [ocr, vision, imageData] = await Promise.all([
    detectOCR(imageDataUrl),
    fetchVision(imageDataUrl, size),
    loadImageData(imageDataUrl),
  ]);

  const texts =
    vision.texts.length > 0
      ? mergeTexts(vision.texts, ocr.words, imageData)
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
