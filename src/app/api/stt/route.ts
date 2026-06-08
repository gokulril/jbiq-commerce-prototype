import { NextRequest, NextResponse } from "next/server";

// Run on Cloudflare Workers (edge) — no 10-second timeout, global CDN
export const runtime = "edge";

/**
 * POST /commerce/api/stt
 *
 * Server-side proxy for Sarvam AI Saarika speech-to-text.
 * Keeps SARVAM_API_KEY server-side (never exposed to the browser).
 *
 * Request: multipart/form-data with field "audio" (Blob — audio/webm or audio/mp4)
 * Response: { transcript: string }
 *
 * ─── Deployment note ────────────────────────────────────────────────────────
 * This route works in `npm run dev:commerce` (Next.js dev server).
 * It is NOT included in `next build` because next.config.ts uses
 * `output: "export"` (static export mode).
 *
 * For a production deployment that needs server-side STT:
 *   1. Change next.config.ts: output → "standalone"  (enables API routes)
 *   2. Deploy to a Node.js host (Vercel, Railway, etc.)
 *   OR
 *   3. Keep static export and proxy via a separate serverless function / BFF.
 * ────────────────────────────────────────────────────────────────────────────
 */

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.SARVAM_API_KEY;

  if (!apiKey) {
    console.error("[STT] SARVAM_API_KEY is not set.");
    return NextResponse.json(
      {
        error:
          "SARVAM_API_KEY is not configured. Copy apps/commerce/.env.local.example → " +
          "apps/commerce/.env.local and paste your key from dashboard.sarvam.ai.",
      },
      { status: 500 },
    );
  }

  let incoming: FormData;
  try {
    incoming = await req.formData();
  } catch {
    return NextResponse.json({ error: "Could not parse multipart body." }, { status: 400 });
  }

  const audio = incoming.get("audio");
  if (!audio || !(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "Missing or empty audio field." }, { status: 400 });
  }

  // Strip codec suffix — Sarvam rejects "audio/webm;codecs=opus" but accepts "audio/webm"
  const baseMime = (audio.type || "audio/webm").split(";")[0].trim() || "audio/webm";
  const cleanAudio = new Blob([await audio.arrayBuffer()], { type: baseMime });

  // iOS Safari records audio/mp4 (AAC), not WebM.
  // Sarvam validates by filename extension, so we must match it to the actual MIME type.
  const ext = baseMime === "audio/mp4" ? "mp4"
             : baseMime === "audio/ogg" ? "ogg"
             : "webm";

  const languageCode = incoming.get("language_code");

  const sarvamForm = new FormData();
  sarvamForm.append("file", cleanAudio, `recording.${ext}`);
  sarvamForm.append("model", "saaras:v3");
  sarvamForm.append("mode", "transcribe");
  if (languageCode && typeof languageCode === "string") {
    sarvamForm.append("language_code", languageCode);
  }

  let upstream: Response;
  try {
    upstream = await fetch("https://api.sarvam.ai/speech-to-text", {
      method: "POST",
      headers: { "api-subscription-key": apiKey },
      body: sarvamForm,
    });
  } catch (err) {
    console.error("[STT] Network error reaching Sarvam:", err);
    return NextResponse.json({ error: "Could not reach Sarvam API." }, { status: 502 });
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "(no body)");
    console.error("[STT] Sarvam returned", upstream.status, detail);
    return NextResponse.json(
      { error: "Sarvam API error.", detail, status: upstream.status },
      { status: upstream.status },
    );
  }

  const data = (await upstream.json()) as { transcript?: string; language_code?: string };
  return NextResponse.json({ transcript: data.transcript ?? "" });
}
