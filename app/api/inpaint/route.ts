import { NextResponse } from "next/server";

// Talks to a locally-running IOPaint (LaMa) server. Free, offline, and keeps
// the background pixel-identical outside the mask.
export const runtime = "nodejs";
export const maxDuration = 120;

const IOPAINT_URL = process.env.IOPAINT_URL ?? "http://127.0.0.1:8080";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Strip a data-URL prefix, leaving raw base64 (what IOPaint expects). */
function toRawBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Request body must be valid JSON.", 400);
  }

  const { image, mask } = (body ?? {}) as { image?: unknown; mask?: unknown };
  if (typeof image !== "string" || typeof mask !== "string") {
    return fail("`image` and `mask` (data-URLs) are required.", 400);
  }

  try {
    const res = await fetch(`${IOPAINT_URL}/api/v1/inpaint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: toRawBase64(image),
        mask: toRawBase64(mask),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("IOPaint error:", res.status, detail.slice(0, 500));
      return fail(`Local LaMa server error (${res.status}).`, 502);
    }

    // IOPaint returns the inpainted image as raw bytes.
    const buffer = Buffer.from(await res.arrayBuffer());
    const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
    return NextResponse.json({ image: dataUrl });
  } catch (err) {
    console.error("Inpaint request failed:", err);
    return fail(
      "Could not reach the local LaMa server. Is `iopaint start` running on port 8080?",
      502,
    );
  }
}
