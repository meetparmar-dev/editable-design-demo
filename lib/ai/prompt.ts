/**
 * Prompt construction for the Vision analysis call.
 *
 * Coordinate strategy (important):
 * gpt-4o does NOT reliably report absolute pixel coordinates — it reasons in a
 * small internal canvas (~1000px) and ignores the true image size, which packs
 * everything into the top-left at the wrong scale. So we ask for a NORMALIZED
 * 0–1000 grid (its natural space) and scale to real pixels ourselves in
 * analyzeDesign(). This is far more consistent than begging for pixels.
 */

export const SYSTEM_PROMPT = `You are a precise design-analysis engine for a graphic editor.
You receive a single design image and must return ONLY a JSON object describing every piece of visible text in it.

Hard rules:
- Output MUST be a single valid JSON object. No markdown, no code fences, no commentary.
- Detect every distinct text block. Group words that visually belong to the same line/style into one block (e.g. "BIG SALE" is one block, not two).
- Do NOT invent text that is not clearly visible.
- Also detect prominent NON-text graphic elements (solid shapes/buttons, and logos/icons). Give each a confidence from 0 to 1. Be conservative — if an element is fused into a complex background or you are unsure of its bounds, give it a LOW confidence so it stays in the background.`;

/**
 * The per-request user prompt. All geometry is requested on a normalized
 * 1000×1000 grid so we can scale it precisely to the real image afterwards.
 */
export function buildUserPrompt(): string {
  return `Analyze the design image and return a JSON object describing its text and graphic elements.

ALL coordinates and sizes use a NORMALIZED 1000×1000 grid, independent of the real pixel size:
- x and width are measured 0–1000 across the image WIDTH (0 = left edge, 1000 = right edge).
- y, height and fontSize are measured 0–1000 across the image HEIGHT (0 = top edge, 1000 = bottom edge).
So a text block filling the middle third horizontally starts near x=333 with width≈334; a headline whose glyphs are one tenth of the image height has fontSize≈100.

Return this exact shape:

{
  "texts": [
    {
      "text": "BIG SALE",
      "x": 120,
      "y": 90,
      "width": 420,
      "height": 80,
      "fontSize": 62,
      "fontWeight": "700",
      "fontFamily": "Montserrat",
      "color": "#ffffff",
      "rotation": 0,
      "textAlign": "center"
    }
  ],
  "elements": [
    {
      "type": "rectangle",
      "x": 100,
      "y": 800,
      "width": 240,
      "height": 70,
      "fill": "#ff3366",
      "cornerRadius": 8,
      "rotation": 0,
      "confidence": 0.9
    }
  ]
}

Text field rules:
- x, y: top-left corner of the text block's bounding box on the 1000-grid.
- width, height: bounding box size on the 1000-grid.
- fontSize: glyph height on the HEIGHT 1000-grid (be generous — headlines are large).
- fontWeight: a CSS weight string like "400", "600", or "700".
- fontFamily: your best guess at the typeface (a common web-safe or Google font name).
- color: the text fill color as a hex string like "#ffffff".
- rotation: clockwise rotation in degrees (0 if upright).
- textAlign: one of "left", "center", "right", "justify".

Element rules:
- type: "rectangle" or "ellipse" for solid shapes/buttons; "image" for logos/icons.
- x, y, width, height: bounding box on the same 1000-grid.
- fill: shape fill as a hex string (omit for "image").
- cornerRadius: on the WIDTH 1000-grid, for rounded rectangles/buttons (0 if square).
- confidence: 0–1, how cleanly separable the element is. Do NOT re-list text here.

Return only the JSON object.`;
}
