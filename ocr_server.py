"""
Local text-detection server (EasyOCR) for the editable-design demo.

Why this exists: browsers can't reliably find text baked into arbitrary images.
Tesseract fails on light-on-dark / stylised text, and a pixel-threshold heuristic
collapses on gradients (every pixel "differs" from one background colour).
EasyOCR is a real detection+recognition model trained on photos, so it returns
accurate per-line boxes on gradients, textures, and low contrast alike.

It mirrors the local LaMa (IOPaint) setup: a small always-on service the Next
app calls. Detection here + Vision for clean content + LaMa for erase = accurate
"make the text editable" on any image.

Run:
  ~/ocr-venv/bin/python -m uvicorn ocr_server:app --host 127.0.0.1 --port 8091
"""

import base64
import io

import easyocr
import numpy as np
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from PIL import Image

app = FastAPI()

# Load once at startup (first run downloads the detector + recogniser weights).
reader = easyocr.Reader(["en"], gpu=False)


def _decode(image_field: str) -> bytes:
    """Accept a data-URL or raw base64 and return the image bytes."""
    comma = image_field.find(",")
    raw = image_field[comma + 1 :] if comma >= 0 else image_field
    return base64.b64decode(raw)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/ocr")
async def ocr(req: Request):
    try:
        body = await req.json()
    except Exception:
        return JSONResponse({"error": "invalid JSON"}, status_code=400)

    image_field = body.get("image")
    if not isinstance(image_field, str) or not image_field:
        return JSONResponse({"error": "`image` (data-URL) required"}, status_code=400)

    try:
        img = Image.open(io.BytesIO(_decode(image_field))).convert("RGB")
    except Exception:
        return JSONResponse({"error": "could not decode image"}, status_code=400)

    # detail=1 → boxes+text+conf; paragraph=False → one box per text line.
    results = reader.readtext(np.array(img), detail=1, paragraph=False)

    boxes = []
    for bbox, text, conf in results:
        xs = [float(p[0]) for p in bbox]
        ys = [float(p[1]) for p in bbox]
        x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
        boxes.append(
            {
                "text": text,
                "x": x0,
                "y": y0,
                "width": x1 - x0,
                "height": y1 - y0,
                "confidence": float(conf),
            }
        )

    return {"boxes": boxes}
