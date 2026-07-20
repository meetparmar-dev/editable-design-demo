import { sampleBackgroundColor, type Box } from "@/lib/fabric/coverPatch";

/**
 * Tesseract OCR (browser, no API cost). It returns pixel-exact bounding boxes
 * in the image's own coordinate space — which IS our canvas world (Phase 3) —
 * so we use it for GEOMETRY: where each word/line actually sits and how tall it
 * is. Content/color are filled in elsewhere (Vision + pixel sampling).
 */

export interface OcrBox {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

type Page = Awaited<ReturnType<import("tesseract.js").Worker["recognize"]>>["data"];

function collectBoxes(page: Page, words: OcrBox[], lines: OcrBox[]) {
  for (const block of page.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        const lt = (line.text ?? "").replace(/\s+/g, " ").trim();
        if (lt) {
          const b = line.bbox;
          lines.push({
            text: lt,
            x: b.x0,
            y: b.y0,
            width: b.x1 - b.x0,
            height: b.y1 - b.y0,
            confidence: line.confidence,
          });
        }
        for (const w of line.words ?? []) {
          const wt = (w.text ?? "").trim();
          if (!wt) continue;
          const b = w.bbox;
          words.push({
            text: wt,
            x: b.x0,
            y: b.y0,
            width: b.x1 - b.x0,
            height: b.y1 - b.y0,
            confidence: w.confidence,
          });
        }
      }
    }
  }
}

export async function detectOCR(
  imageDataUrl: string,
): Promise<{ words: OcrBox[]; lines: OcrBox[] }> {
  // Two passes, unioned: the ORIGINAL image reads thick/solid text cleanly,
  // while a high-pass PREPROCESSED copy exposes thin & low-contrast text the
  // original hides. Together they cover glyphs of every weight and contrast.
  const prepped = await preprocessForOCR(imageDataUrl);
  const sources = prepped ? [imageDataUrl, prepped] : [imageDataUrl];

  // Dynamic import keeps tesseract.js (and its wasm) out of the SSR bundle.
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");

  const words: OcrBox[] = [];
  const lines: OcrBox[] = [];
  try {
    for (const src of sources) {
      const { data } = await worker.recognize(src, {}, { blocks: true });
      collectBoxes(data, words, lines);
    }
  } finally {
    await worker.terminate();
  }

  return { words, lines };
}

// --- Preprocessing (high-pass) ----------------------------------------------

/**
 * Turn text on any smooth background into crisp dark-on-white for OCR.
 *
 * We subtract a blurred copy from the original (a high-pass filter): the smooth
 * background (including gradients) cancels out, while text — being high-freq —
 * survives. Taking the absolute difference catches BOTH light-on-dark and
 * dark-on-light text. The result is dark glyphs on white, which Tesseract reads
 * far more reliably than low-contrast colored text.
 */
async function preprocessForOCR(dataUrl: string): Promise<string | null> {
  const img = await loadImage(dataUrl);
  if (!img) return null;

  const W = img.naturalWidth;
  const H = img.naturalHeight;

  const orig = document.createElement("canvas");
  orig.width = W;
  orig.height = H;
  const oc = orig.getContext("2d");
  if (!oc) return null;
  oc.drawImage(img, 0, 0);
  const od = oc.getImageData(0, 0, W, H).data;

  const blur = document.createElement("canvas");
  blur.width = W;
  blur.height = H;
  const bc = blur.getContext("2d");
  if (!bc) return null;
  bc.filter = "blur(10px)";
  bc.drawImage(img, 0, 0);
  bc.filter = "none";
  const bd = bc.getImageData(0, 0, W, H).data;

  const out = oc.createImageData(W, H);
  const outd = out.data;
  const gain = 4;
  for (let i = 0; i < od.length; i += 4) {
    const go = 0.299 * od[i] + 0.587 * od[i + 1] + 0.114 * od[i + 2];
    const gb = 0.299 * bd[i] + 0.587 * bd[i + 1] + 0.114 * bd[i + 2];
    const v = 255 - Math.min(255, Math.abs(go - gb) * gain);
    outd[i] = outd[i + 1] = outd[i + 2] = v;
    outd[i + 3] = 255;
  }
  oc.putImageData(out, 0, 0);
  return orig.toDataURL("image/png");
}

function loadImage(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// --- Colour sampling ---------------------------------------------------------

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
}

/**
 * Read a text region's color (and rough boldness) straight from the pixels: the
 * foreground is everything inside the box that differs enough from the
 * surrounding background. This is why the editable text ends up the SAME color
 * as the original — we sample it, not guess it.
 */
export function sampleTextColor(
  img: ImageData,
  box: Box,
  bgHex?: string,
): { color: string; bold: boolean } {
  // Reference background: the ring just outside the box (good for text over a
  // gradient/photo). Callers pass `bgHex` — the fill of a shape the text sits
  // ON — when the ring would sample the wrong thing (a highlight box whose
  // bounds reach a photo). That keeps low-contrast text-on-gradient correct
  // while fixing text-on-highlight-box.
  const bg = hexToRgb(bgHex ?? sampleBackgroundColor(img, box));
  const { data, width, height } = img;

  const x0 = Math.max(0, Math.round(box.x));
  const y0 = Math.max(0, Math.round(box.y));
  const x1 = Math.min(width, Math.round(box.x + box.width));
  const y1 = Math.min(height, Math.round(box.y + box.height));

  let r = 0;
  let g = 0;
  let b = 0;
  let fg = 0;
  let total = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      total++;
      const idx = (y * width + x) * 4;
      const dist =
        Math.abs(data[idx] - bg.r) +
        Math.abs(data[idx + 1] - bg.g) +
        Math.abs(data[idx + 2] - bg.b);
      if (dist > 90) {
        r += data[idx];
        g += data[idx + 1];
        b += data[idx + 2];
        fg++;
      }
    }
  }

  if (fg === 0) {
    const lum = (bg.r * 299 + bg.g * 587 + bg.b * 114) / 1000;
    return { color: lum > 140 ? "#000000" : "#ffffff", bold: false };
  }

  const color = `#${toHex(Math.round(r / fg))}${toHex(Math.round(g / fg))}${toHex(Math.round(b / fg))}`;
  return { color, bold: fg / Math.max(1, total) > 0.3 };
}
