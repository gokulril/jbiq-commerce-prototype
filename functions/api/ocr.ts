/**
 * Cloudflare Pages Function — POST /api/ocr
 *
 * Handwritten-list OCR via Claude (Anthropic) vision.
 *
 * Replaces the old Sarvam doc-digitization 7-step async job. Claude reads the
 * image, ignores unrelated notes (reminders / to-dos), translates Hindi→English,
 * normalises quantities, and returns structured items in ONE synchronous call.
 * On a blank / unreadable image it returns an empty list (the client then asks
 * the user to retake) — no hallucinated sample data.
 *
 * Sarvam is still used for voice (see stt.ts); only OCR moved to Claude.
 *
 * Request : multipart/form-data, field "image"
 * Response: { items: [{ name_en, name_hi, qty, unit }] }  (items may be empty)
 * Env     : ANTHROPIC_API_KEY
 */

interface Env {
  ANTHROPIC_API_KEY: string;
}

const ANTHROPIC = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const PROMPT =
  "You are reading a photo of a handwritten household shopping list. The page MAY also contain " +
  "unrelated notes (reminders, to-dos, names, emails, arrows, ticks). Extract ONLY items a person " +
  "buys from a shop/market (groceries, household goods, clothing, etc.). For each item: " +
  "name_en (canonical English name, singular, lowercase); name_hi (Devanagari); " +
  "qty (digits only, or empty string); unit (one of kg, g, l, ml, packet, piece, dozen, or empty string). " +
  "Ignore anything that is not a purchasable item. If the image has no shopping list, return an empty items array. " +
  'Respond with ONLY strict JSON, no prose, no markdown fences: ' +
  '{"items":[{"name_en":"","name_hi":"","qty":"","unit":""}]}';

/** ArrayBuffer → base64, chunked to avoid call-stack limits on large images. */
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const apiKey = context.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "ANTHROPIC_API_KEY not configured.", items: [] }, { status: 500 });

  // ── Parse the uploaded image ──────────────────────────────────────────────
  let image: File | null = null;
  try {
    const form = await context.request.formData();
    const raw = form.get("image");
    if (raw instanceof File && raw.size > 0) image = raw;
  } catch {
    return Response.json({ error: "Could not parse multipart body.", items: [] }, { status: 400 });
  }
  if (!image) return Response.json({ error: "Missing or empty image field.", items: [] }, { status: 400 });

  const mediaType = ALLOWED_MEDIA.has(image.type) ? image.type : "image/jpeg";

  try {
    const b64 = toBase64(await image.arrayBuffer());

    const r = await fetch(ANTHROPIC, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });

    const bodyText = await r.text();
    if (!r.ok) {
      return Response.json({ error: `Claude API error (${r.status}): ${bodyText}`, items: [] }, { status: 502 });
    }

    // Anthropic response: { content: [{ type: "text", text: "..." }], ... }
    let modelText = "";
    try {
      const data = JSON.parse(bodyText) as { content?: { type?: string; text?: string }[] };
      modelText = (data.content ?? []).find((b) => b.type === "text")?.text ?? "";
    } catch {
      return Response.json({ error: `Claude returned non-JSON envelope: ${bodyText}`, items: [] }, { status: 502 });
    }

    // Extract the JSON object from the model text (tolerate stray ``` fences / prose).
    const match = modelText.match(/\{[\s\S]*\}/);
    let items: unknown = [];
    if (match) {
      try { items = (JSON.parse(match[0]) as { items?: unknown }).items ?? []; } catch { items = []; }
    }
    if (!Array.isArray(items)) items = [];

    // Keep only well-formed entries with a non-empty English name.
    const clean = (items as Record<string, unknown>[])
      .filter((it) => it && typeof it === "object" && String(it.name_en ?? "").trim())
      .map((it) => ({
        name_en: String(it.name_en ?? "").trim(),
        name_hi: String(it.name_hi ?? "").trim(),
        qty: String(it.qty ?? "").trim(),
        unit: String(it.unit ?? "").trim(),
      }));

    return Response.json({ items: clean });

  } catch (err) {
    return Response.json({ error: `Internal OCR error: ${String(err)}`, items: [] }, { status: 500 });
  }
};
