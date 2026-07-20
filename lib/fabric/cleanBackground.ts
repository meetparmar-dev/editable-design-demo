import type { Box } from "./coverPatch";

/**
 * Produce a "cleaned" version of the source image with the given regions
 * (detected text + buttons) erased, while keeping the background — including
 * smooth gradients — intact.
 *
 * Method: for every row inside a region we linearly interpolate between the
 * background pixel just LEFT of the region and the one just RIGHT of it. On a
 * vertical gradient (very common in posters) each row's border pixels are the
 * correct shade for that row, so the fill blends in instead of leaving a solid
 * block. It's a lightweight content-aware fill — not a full inpainting model,
 * but clean and instant on flat/gradient backgrounds.
 */
export async function buildCleanBackground(
  sourceDataUrl: string,
  boxes: Box[],
): Promise<string | null> {
  const img = await loadImage(sourceDataUrl);
  if (!img) return null;

  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, W, H);
  const data = imageData.data;

  const clamp = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v));
  const PAD = 6; // erase a little beyond the box to catch anti-aliased edges

  for (const box of boxes) {
    const x0 = clamp(Math.floor(box.x - PAD), 0, W - 1);
    const x1 = clamp(Math.ceil(box.x + box.width + PAD), 0, W);
    const y0 = clamp(Math.floor(box.y - PAD), 0, H - 1);
    const y1 = clamp(Math.ceil(box.y + box.height + PAD), 0, H);

    // Background samples just outside the region, per row.
    const lx = clamp(x0 - 2, 0, W - 1);
    const rx = clamp(x1 + 1, 0, W - 1);
    const span = Math.max(1, x1 - x0);

    for (let y = y0; y < y1; y++) {
      const li = (y * W + lx) * 4;
      const ri = (y * W + rx) * 4;
      const lr = data[li];
      const lg = data[li + 1];
      const lb = data[li + 2];
      const rr = data[ri];
      const rg = data[ri + 1];
      const rb = data[ri + 2];

      for (let x = x0; x < x1; x++) {
        const t = (x - x0) / span;
        const idx = (y * W + x) * 4;
        data[idx] = Math.round(lr + (rr - lr) * t);
        data[idx + 1] = Math.round(lg + (rg - lg) * t);
        data[idx + 2] = Math.round(lb + (rb - lb) * t);
        data[idx + 3] = 255;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function loadImage(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
