/**
 * Cloudflare Pages Function — POST /api/ocr
 *
 * Server-side proxy for Sarvam Document Intelligence (Sarvam Vision).
 * Runs as a Cloudflare Worker — no 10-second timeout, handles the full
 * 5-step async OCR job (typically 10–25 seconds for a single-page photo).
 *
 * Flow: Create job → Get upload URL → PUT image → Start job → Poll status
 *       → Get download URL → Download ZIP → Extract Markdown text
 */

// @ts-ignore — jszip types not available in edge env; runtime works fine
import JSZip from "jszip";

interface Env {
  SARVAM_API_KEY: string;
}

const SARVAM = "https://api.sarvam.ai";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const apiKey = context.env.SARVAM_API_KEY;

  if (!apiKey) {
    return Response.json({ error: "SARVAM_API_KEY not configured." }, { status: 500 });
  }

  let image: File | null = null;
  try {
    const form = await context.request.formData();
    const raw = form.get("image");
    if (raw instanceof File && raw.size > 0) image = raw;
  } catch {
    return Response.json({ error: "Could not parse multipart body." }, { status: 400 });
  }

  if (!image) {
    return Response.json({ error: "Missing or empty image field." }, { status: 400 });
  }

  const h = { "api-subscription-key": apiKey };
  const jsonHeaders = { "Content-Type": "application/json", ...h };
  const filename = image.name || "photo.jpg";

  try {
    /* ── Step 1: Create job ── */
    const createRes = await fetch(`${SARVAM}/doc-digitization/job/v1`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ job_parameters: { language: "hi-IN", output_format: "md" } }),
    });
    if (!createRes.ok) {
      const detail = await createRes.text().catch(() => "");
      return Response.json({ error: "Create job failed.", detail }, { status: createRes.status });
    }
    const { job_id } = await createRes.json() as { job_id: string };

    /* ── Step 2: Get pre-signed upload URL ── */
    const uploadUrlRes = await fetch(`${SARVAM}/doc-digitization/job/v1/upload-files`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ job_id, files: [filename] }),
    });
    if (!uploadUrlRes.ok) {
      const detail = await uploadUrlRes.text().catch(() => "");
      return Response.json({ error: `Upload-URL step ${uploadUrlRes.status}: ${detail.slice(0, 200)}` }, { status: 500 });
    }
    const uploadData = await uploadUrlRes.json() as Record<string, unknown>;
    /* Sarvam v1 returned upload_details[0].file_url; current API returns upload_url at top level */
    const details = (uploadData?.upload_details ?? uploadData?.files ?? []) as { file_url?: string; upload_url?: string }[];
    const uploadUrl = (uploadData?.upload_url as string | undefined)
      ?? details[0]?.file_url
      ?? details[0]?.upload_url;
    if (!uploadUrl) {
      return Response.json({ error: `No upload URL. Sarvam said: ${JSON.stringify(uploadData).slice(0, 250)}` }, { status: 500 });
    }

    /* ── Step 3: Upload image ── */
    const imgBuffer = await image.arrayBuffer();
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      body: imgBuffer,
      headers: { "Content-Type": image.type || "image/jpeg" },
    });
    if (!putRes.ok) {
      return Response.json({ error: "Image upload failed." }, { status: 502 });
    }

    /* ── Step 4: Start job ── */
    await fetch(`${SARVAM}/doc-digitization/job/v1/${job_id}/start`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({}),
    });

    /* ── Step 5: Poll until completed (max 60 s) ── */
    let state = "Pending";
    for (let i = 0; i < 30; i++) {
      await new Promise<void>((r) => setTimeout(r, 2000));
      const statusRes = await fetch(`${SARVAM}/doc-digitization/job/v1/${job_id}/status`, {
        headers: h,
      });
      const statusData = await statusRes.json() as { job_state?: string };
      state = statusData.job_state ?? state;
      if (state === "Completed" || state === "Failed" || state === "PartiallyCompleted") break;
    }
    if (state === "Failed") {
      return Response.json({ error: "Sarvam OCR job failed." }, { status: 500 });
    }

    /* ── Step 6: Get download URL ── */
    const downloadRes = await fetch(`${SARVAM}/doc-digitization/job/v1/${job_id}/download-files`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ job_id }),
    });
    const downloadData = await downloadRes.json() as {
      download_details?: { file_url: string }[];
    };
    const downloadUrl = downloadData?.download_details?.[0]?.file_url;
    if (!downloadUrl) {
      return Response.json({ error: "No download URL returned." }, { status: 500 });
    }

    /* ── Step 7: Download ZIP and extract text ── */
    const zipRes = await fetch(downloadUrl);
    const zipBuffer = await zipRes.arrayBuffer();
    const zip = await JSZip.loadAsync(zipBuffer);

    let text = "";

    for (const [name, file] of Object.entries(zip.files) as [string, any][]) {
      if (!file.dir && name.endsWith(".md")) {
        text = await file.async("text");
        break;
      }
    }

    if (!text) {
      for (const [name, file] of Object.entries(zip.files) as [string, any][]) {
        if (!file.dir && name.endsWith(".json")) {
          const raw = await file.async("text");
          try {
            const data = JSON.parse(raw);
            if (Array.isArray(data)) {
              text = data.map((p: any) => p.markdown ?? p.text ?? p.content ?? "").join("\n");
            } else if (data?.pages) {
              text = data.pages.map((p: any) => p.markdown ?? p.text ?? "").join("\n");
            }
          } catch {
            text = raw;
          }
          break;
        }
      }
    }

    return Response.json({ text: text.trim() });
  } catch (err) {
    console.error("[OCR] Unexpected error:", err);
    return Response.json({ error: "Internal error during OCR." }, { status: 500 });
  }
};
