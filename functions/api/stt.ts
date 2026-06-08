/**
 * Cloudflare Pages Function — POST /api/stt
 *
 * Server-side proxy for Sarvam AI Saarika speech-to-text.
 * Runs as a Cloudflare Worker (no timeout on I/O operations).
 * SARVAM_API_KEY is read from Cloudflare Pages environment variables.
 */

interface Env {
  SARVAM_API_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const apiKey = context.env.SARVAM_API_KEY;

  if (!apiKey) {
    return Response.json({ error: "SARVAM_API_KEY not configured." }, { status: 500 });
  }

  let incoming: FormData;
  try {
    incoming = await context.request.formData();
  } catch {
    return Response.json({ error: "Could not parse multipart body." }, { status: 400 });
  }

  const audio = incoming.get("audio");
  if (!audio || !(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ error: "Missing or empty audio field." }, { status: 400 });
  }

  // Strip codec suffix — Sarvam rejects "audio/webm;codecs=opus" but accepts "audio/webm"
  const baseMime = (audio.type || "audio/webm").split(";")[0].trim() || "audio/webm";
  const cleanAudio = new Blob([await audio.arrayBuffer()], { type: baseMime });

  // iOS Safari records audio/mp4 — match filename extension to actual MIME type
  const ext = baseMime === "audio/mp4" ? "mp4"
             : baseMime === "audio/ogg" ? "ogg"
             : "webm";

  const sarvamForm = new FormData();
  sarvamForm.append("file", cleanAudio, `recording.${ext}`);
  sarvamForm.append("model", "saaras:v3");
  sarvamForm.append("mode", "transcribe");

  let upstream: Response;
  try {
    upstream = await fetch("https://api.sarvam.ai/speech-to-text", {
      method: "POST",
      headers: { "api-subscription-key": apiKey },
      body: sarvamForm,
    });
  } catch {
    return Response.json({ error: "Could not reach Sarvam API." }, { status: 502 });
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "(no body)");
    return Response.json(
      { error: "Sarvam API error.", detail, status: upstream.status },
      { status: upstream.status },
    );
  }

  const data = await upstream.json() as { transcript?: string };
  return Response.json({ transcript: data.transcript ?? "" });
};
