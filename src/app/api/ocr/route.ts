import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";

/**
 * POST /commerce/api/ocr
 *
 * Server-side proxy for Sarvam Document Intelligence (Sarvam Vision).
 * Accepts an image file, runs the full 5-step async job, returns extracted text.
 *
 * Flow: Create job → Get upload URL → PUT image → Start job → Poll status
 *       → Get download URL → Download ZIP → Extract Markdown text
 *
 * Typical latency: 10–25 seconds for a single-page shopping list or bill photo.
 *
 * ─── Deployment note ────────────────────────────────────────────────────────
 * Works in `npm run dev:commerce`. Excluded from static export (`next build`).
 * On Vercel Hobby (10s timeout) this will time out — use Pro (300s) or a
 * separate long-running service for production.
 * ────────────────────────────────────────────────────────────────────────────
 */

const SARVAM = "https://api.sarvam.ai";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "SARVAM_API_KEY not set. See .env.local.example." },
      { status: 500 },
    );
  }

  let image: File | null = null;
  try {
    const form = await req.formData();
    const raw = form.get("image");
    if (raw instanceof File && raw.size > 0) image = raw;
  } catch {
    return NextResponse.json({ error: "Could not parse multipart body." }, { status: 400 });
  }
  if (!image) {
    return NextResponse.json({ error: "Missing or empty image field." }, { status: 400 });
  }

  const h = { "api-subscription-key": apiKey };
  const json = (b: object) => ({ "Content-Type": "application/json", ...h, body: JSON.stringify(b) });
  const filename = image.name || "photo.jpg";

  try {
    /* ── Step 1: Create job ─────────────────────────────────────────────── */
    const createRes = await fetch(`${SARVAM}/doc-digitization/job/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...h },
      body: JSON.stringify({ job_parameters: { language: "hi-IN", output_format: "md" } }),
    });
    if (!createRes.ok) {
      const detail = await createRes.text().catch(() => "");
      return NextResponse.json({ error: "Create job failed.", detail }, { status: createRes.status });
    }
    const { job_id } = await createRes.json() as { job_id: string };

    /* ── Step 2: Get pre-signed upload URL ──────────────────────────────── */
    const uploadUrlRes = await fetch(`${SARVAM}/doc-digitization/job/v1/upload-files`, {
      method: "POST",
      ...json({ job_id, files: [filename] }),
    });
    const uploadData = await uploadUrlRes.json() as {
      upload_details?: { file_url: string }[];
    };
    const uploadUrl = uploadData?.upload_details?.[0]?.file_url;
    if (!uploadUrl) {
      return NextResponse.json({ error: "No upload URL returned." }, { status: 500 });
    }

    /* ── Step 3: Upload image to pre-signed URL ──────────────────────────── */
    const imgBuffer = await image.arrayBuffer();
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      body: imgBuffer,
      headers: { "Content-Type": image.type || "image/jpeg" },
    });
    if (!putRes.ok) {
      return NextResponse.json({ error: "Image upload failed.", status: putRes.status }, { status: 502 });
    }

    /* ── Step 4: Start job ──────────────────────────────────────────────── */
    await fetch(`${SARVAM}/doc-digitization/job/v1/${job_id}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...h },
      body: JSON.stringify({}),
    });

    /* ── Step 5: Poll until Completed or Failed (max 60 s) ──────────────── */
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
      return NextResponse.json({ error: "Sarvam OCR job failed." }, { status: 500 });
    }

    /* ── Step 6: Get download URL ───────────────────────────────────────── */
    const downloadRes = await fetch(`${SARVAM}/doc-digitization/job/v1/${job_id}/download-files`, {
      method: "POST",
      ...json({ job_id }),
    });
    const downloadData = await downloadRes.json() as {
      download_details?: { file_url: string; file_name?: string }[];
    };
    const downloadUrl = downloadData?.download_details?.[0]?.file_url;
    if (!downloadUrl) {
      return NextResponse.json({ error: "No download URL returned." }, { status: 500 });
    }

    /* ── Step 7: Download ZIP and extract text ───────────────────────────── */
    const zipRes = await fetch(downloadUrl);
    const zipBuffer = await zipRes.arrayBuffer();
    const zip = await JSZip.loadAsync(zipBuffer);

    let text = "";

    // Prefer Markdown output
    for (const [name, file] of Object.entries(zip.files)) {
      if (!file.dir && name.endsWith(".md")) {
        text = await file.async("text");
        break;
      }
    }

    // Fall back to JSON
    if (!text) {
      for (const [name, file] of Object.entries(zip.files)) {
        if (!file.dir && name.endsWith(".json")) {
          const raw = await file.async("text");
          try {
            const data = JSON.parse(raw) as
              | { pages?: { markdown?: string; text?: string; content?: string }[] }
              | { markdown?: string; text?: string }[]
              | unknown;
            if (Array.isArray(data)) {
              text = data
                .map((p) =>
                  typeof p === "object" && p !== null
                    ? (p as Record<string, string>).markdown ??
                      (p as Record<string, string>).text ??
                      (p as Record<string, string>).content ??
                      ""
                    : "",
                )
                .join("\n");
            } else if (data && typeof data === "object" && "pages" in data) {
              const pages = (data as { pages: { markdown?: string; text?: string }[] }).pages;
              text = pages.map((p) => p.markdown ?? p.text ?? "").join("\n");
            }
          } catch {
            text = raw;
          }
          break;
        }
      }
    }

    return NextResponse.json({ text: text.trim() });
  } catch (err) {
    console.error("[OCR] Unexpected error:", err);
    return NextResponse.json({ error: "Internal error during OCR." }, { status: 500 });
  }
}
