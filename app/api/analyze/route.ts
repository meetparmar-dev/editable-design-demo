import { NextResponse } from "next/server";
import OpenAI from "openai";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/ai/prompt";

// Force the Node.js runtime — the OpenAI SDK isn't guaranteed on the edge, and
// this route only ever runs server-side (where the API key lives).
export const runtime = "nodejs";

/** Small helper to keep error responses uniform. */
function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fail("Server is missing OPENAI_API_KEY. Add it to .env.local.", 500);
  }

  // --- Parse & validate the request body ---
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Request body must be valid JSON.", 400);
  }

  const { image, width, height } = (body ?? {}) as {
    image?: unknown;
    width?: unknown;
    height?: unknown;
  };

  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    return fail("`image` must be a data-URL string.", 400);
  }
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return fail("`width` and `height` must be positive numbers.", 400);
  }

  // --- Call the Vision model ---
  const openai = new OpenAI({ apiKey });
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      // json_object mode guarantees the model returns parseable JSON (requires
      // the word "json" to appear in the prompt — it does).
      response_format: { type: "json_object" },
      temperature: 0, // deterministic — same image → same analysis
      max_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: buildUserPrompt() },
            { type: "image_url", image_url: { url: image, detail: "high" } },
          ],
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return fail("The model returned an empty response.", 502);

    // We hand back the raw parsed object; the client's analyzeDesign() is the
    // single place that validates/normalizes it into a DesignAnalysis.
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return fail("The model returned invalid JSON.", 502);
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Vision analysis failed:", err);
    return fail("Vision request failed. Check the server logs.", 502);
  }
}
