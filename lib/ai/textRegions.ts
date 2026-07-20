import { sampleBackgroundColor, type Box } from "@/lib/fabric/coverPatch";

/**
 * Refine ONE Vision text box against the actual pixels.
 *
 * Vision reliably tells us WHAT text exists and roughly WHERE, but its box is
 * approximate. A global ink threshold can't tighten it — on a gradient/textured
 * background every pixel "differs" from a single background color, so the whole
 * image reads as ink. The fix is to go LOCAL: sample the background from the
 * ring just around Vision's box (locally near-uniform even on a global
 * gradient), then keep only pixels in a small search window that differ from
 * THAT. The tight bound of those pixels is the real glyph box — exact position,
 * size, and per-line height — which is what makes the editable layer land on the
 * original text and the mask erase the real glyphs.
 *
 * Returns null (caller keeps Vision's box) when the pixels don't give a
 * confident answer — too little ink, or so much that the local background guess
 * clearly failed.
 */
export interface RefinedBox extends Box {
  /** Median detected line height — the caller derives font size from this. */
  lineHeight: number;
}

/** Sum-of-channels distance beyond which a pixel counts as ink (text). */
const INK_THRESHOLD = 70;

export function refineTextBox(img: ImageData, box: Box): RefinedBox | null {
  const { data, width, height } = img;
  const bg = hexToRgb(sampleBackgroundColor(img, box));

  // Search window: Vision's box grown a little, so a slightly-off box still
  // contains the glyphs without swallowing neighbouring lines.
  const padX = Math.max(6, Math.round(box.width * 0.1));
  const padY = Math.max(8, Math.round(box.height * 0.4));
  const wx0 = clamp(box.x - padX, 0, width - 1);
  const wy0 = clamp(box.y - padY, 0, height - 1);
  const wx1 = clamp(box.x + box.width + padX, 0, width);
  const wy1 = clamp(box.y + box.height + padY, 0, height);
  const w = wx1 - wx0;
  const h = wy1 - wy0;
  if (w < 2 || h < 2) return null;

  const rowInk = new Int32Array(h);
  const rowMinX = new Int32Array(h);
  const rowMaxX = new Int32Array(h);
  let inkTotal = 0;
  for (let ry = 0; ry < h; ry++) {
    let count = 0;
    let minX = wx1;
    let maxX = -1;
    const yy = wy0 + ry;
    for (let xx = wx0; xx < wx1; xx++) {
      const i = (yy * width + xx) * 4;
      const dist =
        Math.abs(data[i] - bg.r) +
        Math.abs(data[i + 1] - bg.g) +
        Math.abs(data[i + 2] - bg.b);
      if (dist > INK_THRESHOLD) {
        count++;
        if (xx < minX) minX = xx;
        if (xx > maxX) maxX = xx;
      }
    }
    rowInk[ry] = count;
    rowMinX[ry] = minX;
    rowMaxX[ry] = maxX;
    inkTotal += count;
  }

  // If most of the window is "ink", the local background guess failed (or the
  // box is over a busy graphic) — don't trust it, keep Vision's box.
  if (inkTotal > w * h * 0.7) return null;

  const minRowInk = Math.max(3, Math.round(w * 0.02));
  // Small gap tolerance so a real line break splits into its own band (needed
  // to measure per-line height) but tiny within-glyph gaps don't.
  const maxGap = Math.max(2, Math.round(box.height * 0.06));
  const bands = groupRowsIntoBands(rowInk, rowMinX, rowMaxX, wy0, h, minRowInk, maxGap);
  if (bands.length === 0) return null;

  const gx0 = Math.min(...bands.map((b) => b.x));
  const gx1 = Math.max(...bands.map((b) => b.x + b.width));
  const gy0 = Math.min(...bands.map((b) => b.y));
  const gy1 = Math.max(...bands.map((b) => b.y + b.height));

  return {
    x: gx0,
    y: gy0,
    width: gx1 - gx0,
    height: gy1 - gy0,
    lineHeight: median(bands.map((b) => b.height)),
  };
}

/** Merge runs of inky rows into line boxes, tolerating small vertical gaps. */
function groupRowsIntoBands(
  rowInk: Int32Array,
  rowMinX: Int32Array,
  rowMaxX: Int32Array,
  yOffset: number,
  h: number,
  minRowInk: number,
  maxGap: number,
): Box[] {
  const bands: Box[] = [];
  let ry = 0;
  while (ry < h) {
    if (rowInk[ry] < minRowInk) {
      ry++;
      continue;
    }
    let last = ry;
    let gap = 0;
    let cursor = ry;
    while (cursor + 1 < h) {
      cursor++;
      if (rowInk[cursor] >= minRowInk) {
        last = cursor;
        gap = 0;
      } else if (++gap > maxGap) {
        break;
      }
    }
    let minX = Infinity;
    let maxX = -1;
    for (let k = ry; k <= last; k++) {
      if (rowInk[k] < minRowInk) continue;
      if (rowMinX[k] < minX) minX = rowMinX[k];
      if (rowMaxX[k] > maxX) maxX = rowMaxX[k];
    }
    if (maxX > minX) {
      bands.push({ x: minX, y: yOffset + ry, width: maxX - minX, height: last - ry + 1 });
    }
    ry = last + 1;
  }
  return bands;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
