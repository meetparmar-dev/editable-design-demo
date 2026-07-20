/** A bounding box in image-pixel space. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Why cover patches exist:
 * The uploaded image already has the text/graphics baked into it. When we add
 * an editable layer on top, the original underneath still shows through — you
 * see the text twice. To fake "in-place" editing without a full inpainting
 * model, we paint a rectangle of the *surrounding* background color over each
 * original region, hiding it, and let the editable layer sit on top.
 *
 * This is exact on flat/solid backgrounds and approximate on gradients/photos
 * (a genuine fix there needs inpainting).
 */

/** Decode a data-URL into raw pixels for sampling. */
export function loadImageData(dataUrl: string): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0);
      try {
        resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
}

/**
 * Estimate the background color behind a box by sampling a ring of pixels just
 * OUTSIDE it (so we read the background, not the text). Median per channel is
 * used to shrug off the odd outlier (a nearby edge or different-colored pixel).
 */
export function sampleBackgroundColor(img: ImageData, box: Box): string {
  const { data, width, height } = img;
  const offset = 4; // sample this many px outside the box
  const steps = 6;

  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const fx = box.x + (box.width * i) / steps;
    points.push([fx, box.y - offset]); // above
    points.push([fx, box.y + box.height + offset]); // below
  }
  for (let i = 0; i <= steps; i++) {
    const fy = box.y + (box.height * i) / steps;
    points.push([box.x - offset, fy]); // left
    points.push([box.x + box.width + offset, fy]); // right
  }

  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (const [px, py] of points) {
    const xi = Math.round(px);
    const yi = Math.round(py);
    if (xi < 0 || yi < 0 || xi >= width || yi >= height) continue;
    const idx = (yi * width + xi) * 4;
    rs.push(data[idx]);
    gs.push(data[idx + 1]);
    bs.push(data[idx + 2]);
  }
  if (rs.length === 0) return "#ffffff";

  const median = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  return `#${toHex(median(rs))}${toHex(median(gs))}${toHex(median(bs))}`;
}
