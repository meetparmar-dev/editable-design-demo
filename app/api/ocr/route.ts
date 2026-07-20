import { NextResponse } from "next/server";

// Proxies to the local EasyOCR server (see ocr_server.py). Kept server-side so
// the browser never talks to the Python service directly and the URL stays in
// env. Returns accurate per-line text boxes for any image (gradients included).
export const runtime = "nodejs";
export const maxDuration = 120;

const OCR_URL = process.env.OCR_URL ?? "http://127.0.0.1:8091";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const image = (body as { image?: unknown })?.image;
  if (typeof image !== "string") {
    return NextResponse.json({ error: "`image` (data-URL) is required." }, { status: 400 });
  }

  try {
    const res = await fetch(`${OCR_URL}/ocr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("OCR server error:", res.status, detail.slice(0, 300));
      return NextResponse.json({ error: `OCR server error (${res.status}).` }, { status: 502 });
    }
    return NextResponse.json(await res.json());
  } catch (err) {
    console.error("OCR request failed:", err);
    return NextResponse.json(
      { error: "Could not reach the local OCR server. Is uvicorn running on port 8091?" },
      { status: 502 },
    );
  }
}
