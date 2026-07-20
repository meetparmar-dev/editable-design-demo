/**
 * Client for the local EasyOCR detection server (via /api/ocr). Returns accurate
 * per-line text boxes in the image's own pixel space — the geometry source of
 * truth for placing editable layers and building the erase mask. Returns [] on
 * any failure so callers fall back to the Vision + pixel heuristic.
 */
export interface ModelTextBox {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export async function detectModelOCR(imageDataUrl: string): Promise<ModelTextBox[]> {
  try {
    const res = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageDataUrl }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.boxes) ? (data.boxes as ModelTextBox[]) : [];
  } catch {
    return [];
  }
}
