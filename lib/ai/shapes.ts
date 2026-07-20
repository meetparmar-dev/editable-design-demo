import { dominantColor, sampleBackgroundColor, type Box } from "@/lib/fabric/coverPatch";

/**
 * Detect solid SHAPES (buttons / pills / rounded rectangles) from the pixels —
 * the shape equivalent of the EasyOCR text pass. Vision's shape boxes are
 * unreliable (wrong position, missed shapes), so we find them ourselves.
 *
 * Key idea: a real shape is a SOLID block of one fill colour with a SHARP edge,
 * whereas coloured TEXT is sparse and a gradient has no edge. Every shape in
 * these designs wraps a text block, so we seed from each detected text box:
 * take the colour surrounding the text (the pill fill if there is one), grow a
 * box outward while that colour holds, then keep it only if the boundary is a
 * genuine edge (fill colour inside, something clearly different outside). That
 * rejects gradients and bare text, and snaps real pills to their exact bounds.
 */
export interface ShapeBox extends Box {
  fill: string;
  /** Measured corner radius, so a subtle rounded-rectangle isn't drawn as a
   * full pill (and a pill stays a pill). */
  cornerRadius: number;
}

/** Sum-of-channels tolerance for "this pixel is the fill colour". */
const TOL = 78;
/** A row/column is "inside the shape" when at least this fraction is fill. */
const FILL_RATIO = 0.6;
/** Minimum colour jump inside-vs-outside the box for a real shape edge. Set
 * high enough that a smooth gradient (a gradual drift) never qualifies — only a
 * genuine fill→surround boundary does. */
const EDGE_MIN = 110;

export function detectShapesAroundTexts(img: ImageData, textBoxes: Box[]): ShapeBox[] {
  const shapes: ShapeBox[] = [];
  for (const tb of textBoxes) {
    const s = detectShapeAroundText(img, tb);
    if (s && !shapes.some((e) => overlaps(e, s))) shapes.push(s);
  }
  return shapes;
}

function detectShapeAroundText(img: ImageData, tb: Box): ShapeBox | null {
  const { data, width, height } = img;
  // Seed from the box's dominant interior colour (the fill behind the glyphs),
  // not the ring outside — a highlight box whose OCR bounds already reach its
  // own edge would otherwise seed on whatever borders it (e.g. a photo).
  const fillHex = dominantColor(img, tb);
  const fill = hexToRgb(fillHex);

  const rowRatio = (y: number, x0: number, x1: number) => {
    let hit = 0;
    let total = 0;
    for (let x = x0; x < x1; x += 2) {
      total++;
      if (isFill(data, (y * width + x) * 4, fill)) hit++;
    }
    return total ? hit / total : 0;
  };
  const tx0 = clampI(Math.round(tb.x), 0, width - 1);
  const tx1 = clampI(Math.round(tb.x + tb.width), 1, width);
  let y0 = clampI(Math.round(tb.y), 0, height - 1);
  let y1 = clampI(Math.round(tb.y + tb.height), 1, height);

  // Vertical extent: rows just above/below the text are full-width fill, so grow
  // up/down while the row is mostly fill. Bounded so a gradient can't run away.
  const vLimit = Math.max(20, tb.height * 1.5);
  const hLimit = Math.max(30, tb.width);
  while (y0 > 0 && tb.y - (y0 - 1) < vLimit && rowRatio(y0 - 1, tx0, tx1) > FILL_RATIO) y0--;
  while (y1 < height && y1 - (tb.y + tb.height) < vLimit && rowRatio(y1, tx0, tx1) > FILL_RATIO) y1++;

  // Horizontal extent: a shape is WIDEST at its vertical centre (rounded ends
  // curve away above/below). Scan outward from the text — but across THREE rows
  // and take the widest, so an inline icon (e.g. a logo's globe) that breaks the
  // fill on one row doesn't cut the box short. Non-fill pixels are tolerated for
  // anti-aliasing before we call it the edge.
  const cy = clampI(Math.round((y0 + y1) / 2), 0, height - 1);
  const scanRows = [
    clampI(y0 + Math.round((y1 - y0) * 0.28), 0, height - 1),
    cy,
    clampI(y0 + Math.round((y1 - y0) * 0.72), 0, height - 1),
  ];
  let x0 = tx0;
  let x1 = tx1;
  for (const ry of scanRows) {
    for (let x = tx0 - 1, miss = 0; x >= 0 && tb.x - x < hLimit; x--) {
      if (isFill(data, (ry * width + x) * 4, fill)) {
        if (x < x0) x0 = x;
        miss = 0;
      } else if (++miss > 4) break;
    }
    for (let x = tx1, miss = 0; x < width && x - tx1 < hLimit; x++) {
      if (isFill(data, (ry * width + x) * 4, fill)) {
        if (x + 1 > x1) x1 = x + 1;
        miss = 0;
      } else if (++miss > 4) break;
    }
  }

  const box: Box = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  // A real shape has a genuine boundary: the fill inside, something clearly
  // different just outside. We deliberately require a SOLID contrast against the
  // surround (not a thin border) — that keeps simple pills/highlight boxes and
  // skips logos (a white box + icon + border on a bright bg), which reconstruct
  // worse as a flat rect (the icon is lost) than left as the original.
  const outside = hexToRgb(sampleBackgroundColor(img, box));
  const edge = colorDist(fill, outside);
  const grew = tb.x - x0 + (x1 - (tb.x + tb.width)) + (tb.y - y0) + (y1 - (tb.y + tb.height));
  if (edge < EDGE_MIN) return null;
  if (grew < 6 && edge < 170) return null;

  // A real fill is UNIFORM: most of the box (minus the glyphs) is the fill
  // colour. A photo/person region behind semi-transparent text is NOT uniform,
  // so this rejects those false shapes while keeping solid pills/highlights.
  if (fillFraction(data, width, height, box, fill) < 0.55) return null;

  // Accurate fill: median of a clean strip in the left padding at the centre row
  // (no glyphs there), so the redrawn pill matches the original colour exactly.
  const accurate = stripMedianColor(img, x0 + 3, cy - 5, 10, 10);

  // Corner radius: at the centre row the fill reaches the box's left edge (x0);
  // near the top it recedes by the corner radius. That gap IS the radius — so a
  // gently-rounded rectangle stays gently rounded, and a pill stays a pill.
  const topRow = clampI(y0 + 2, 0, height - 1);
  let xTop = x0;
  for (let x = x0; x < x1; x++) {
    if (isFill(data, (topRow * width + x) * 4, fill)) {
      xTop = x;
      break;
    }
  }
  const cornerRadius = clampI(xTop - x0, 0, Math.floor((y1 - y0) / 2));

  return { ...box, fill: accurate ?? fillHex, cornerRadius };
}

function stripMedianColor(img: ImageData, sx: number, sy: number, w: number, h: number): string | null {
  const { data, width, height } = img;
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let y = sy; y < sy + h; y++) {
    for (let x = sx; x < sx + w; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const i = (y * width + x) * 4;
      rs.push(data[i]);
      gs.push(data[i + 1]);
      bs.push(data[i + 2]);
    }
  }
  if (rs.length === 0) return null;
  const med = (a: number[]) => {
    a.sort((p, q) => p - q);
    return a[Math.floor(a.length / 2)];
  };
  const h2 = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${h2(med(rs))}${h2(med(gs))}${h2(med(bs))}`;
}

function isFill(data: Uint8ClampedArray, i: number, fill: { r: number; g: number; b: number }): boolean {
  return (
    Math.abs(data[i] - fill.r) + Math.abs(data[i + 1] - fill.g) + Math.abs(data[i + 2] - fill.b) < TOL
  );
}

/** Fraction of a box's interior pixels that match the fill colour. */
function fillFraction(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  box: Box,
  fill: { r: number; g: number; b: number },
): number {
  const x0 = Math.max(0, Math.round(box.x));
  const y0 = Math.max(0, Math.round(box.y));
  const x1 = Math.min(width, Math.round(box.x + box.width));
  const y1 = Math.min(height, Math.round(box.y + box.height));
  const stepX = Math.max(1, Math.floor((x1 - x0) / 60));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 60));
  let hit = 0;
  let total = 0;
  for (let y = y0; y < y1; y += stepY) {
    for (let x = x0; x < x1; x += stepX) {
      total++;
      if (isFill(data, (y * width + x) * 4, fill)) hit++;
    }
  }
  return total ? hit / total : 0;
}

function colorDist(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

function overlaps(a: Box, b: Box): boolean {
  const ix = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const iy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return ix > 0 && iy > 0;
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

function clampI(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
