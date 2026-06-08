/**
 * Cloudflare Pages Function — POST /api/ocr
 *
 * Sarvam Document Intelligence (doc-digitization) proxy.
 *
 * Schema verified against the official `sarvamai` Python SDK
 * (document_intelligence/client.py + types/*), not guessed:
 *
 *   Step 2 (upload-files)   → { job_id, job_state, storage_container_type,
 *                               upload_urls:  { "<filename>": { file_url, file_metadata } } }
 *   Step 6 (download-files) → { job_id, job_state, storage_container_type,
 *                               download_urls:{ "<filename>": { file_url, file_metadata } } }
 *
 * The two historical bugs this fixes:
 *   1. Field is `upload_urls` (a MAP keyed by filename, value.file_url), not `upload_url`.
 *      Same for `download_urls` on step 6 — neither is a top-level string.
 *   2. The Azure_V1 blob PUT REQUIRES the header `x-ms-blob-type: BlockBlob`.
 *      Without it Azure rejects the upload with HTTP 400.
 *
 * Flow: Create job → Get upload URL → PUT image (Azure) → Start job
 *       → Poll status → Get download URL → Download ZIP → Extract text
 */

// @ts-ignore — jszip types not available in edge runtime; works fine at runtime
import JSZip from "jszip";

interface Env {
  SARVAM_API_KEY: string;
}

const SARVAM = "https://api.sarvam.ai";

/** One entry in Sarvam's upload_urls / download_urls map. */
interface FileSignedUrlDetails {
  file_url?: string;
  file_metadata?: Record<string, unknown>;
}
type SignedUrlMap = Record<string, FileSignedUrlDetails>;

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  zip: "application/zip",
};

/**
 * Pull a usable https URL out of a Sarvam {filename: {file_url}} map.
 * Prefer an exact filename match; otherwise take the first entry that has a file_url.
 */
function pickFileUrl(map: unknown, preferredName?: string): string | undefined {
  if (!map || typeof map !== "object") return undefined;
  const m = map as SignedUrlMap;

  if (preferredName) {
    const exact = m[preferredName]?.file_url;
    if (typeof exact === "string" && exact.startsWith("http")) return exact;
  }
  for (const v of Object.values(m)) {
    if (v && typeof v.file_url === "string" && v.file_url.startsWith("http")) return v.file_url;
  }
  return undefined;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const apiKey = context.env.SARVAM_API_KEY;
  if (!apiKey) return Response.json({ error: "SARVAM_API_KEY not configured." }, { status: 500 });

  // ── Parse the uploaded image ──────────────────────────────────────────────
  let image: File | null = null;
  try {
    const form = await context.request.formData();
    const raw = form.get("image");
    if (raw instanceof File && raw.size > 0) image = raw;
  } catch {
    return Response.json({ error: "Could not parse multipart body." }, { status: 400 });
  }
  if (!image) return Response.json({ error: "Missing or empty image field." }, { status: 400 });

  // Normalise to a clean filename + matching content type so the blob key,
  // the PUT Content-Type, and Sarvam's `files` entry all agree.
  const rawExt = (image.name?.split(".").pop() || "").toLowerCase();
  const mime = (image.type || "").toLowerCase();
  const ext = CONTENT_TYPES[rawExt]
    ? rawExt
    : mime.includes("png")  ? "png"
    : mime.includes("webp") ? "webp"
    : mime.includes("pdf")  ? "pdf"
    : "jpg";
  const filename = `photo.${ext}`;
  const contentType = CONTENT_TYPES[ext];

  const h  = { "api-subscription-key": apiKey };                       // GET / status calls
  const jh = { "Content-Type": "application/json", ...h };             // JSON POST calls

  try {
    /* ── Step 1: Create job ───────────────────────────────────────────────── */
    const r1 = await fetch(`${SARVAM}/doc-digitization/job/v1`, {
      method: "POST",
      headers: jh,
      body: JSON.stringify({ job_parameters: { language: "hi-IN", output_format: "md" } }),
    });
    const t1 = await r1.text();
    if (!r1.ok) return Response.json({ error: `Step1 create-job failed (${r1.status}): ${t1}` }, { status: 502 });

    let d1: Record<string, unknown> = {};
    try { d1 = JSON.parse(t1); } catch {
      return Response.json({ error: `Step1 non-JSON: ${t1}` }, { status: 502 });
    }
    const job_id = d1.job_id as string | undefined;
    if (!job_id) return Response.json({ error: `No job_id in step1: ${t1}` }, { status: 502 });

    /* ── Step 2: Get presigned upload URL ─────────────────────────────────── */
    const r2 = await fetch(`${SARVAM}/doc-digitization/job/v1/upload-files`, {
      method: "POST",
      headers: jh,
      body: JSON.stringify({ job_id, files: [filename] }),
    });
    const t2 = await r2.text();
    if (!r2.ok) return Response.json({ error: `Step2 upload-files failed (${r2.status}): ${t2}` }, { status: 502 });

    let d2: { upload_urls?: SignedUrlMap } = {};
    try { d2 = JSON.parse(t2); } catch { /* handled below */ }
    const uploadUrl = pickFileUrl(d2.upload_urls, filename);
    if (!uploadUrl) {
      return Response.json({ error: `No upload URL in upload_urls map. Step2=${t2}` }, { status: 502 });
    }

    /* ── Step 3: PUT the image to Azure blob storage ──────────────────────── */
    // x-ms-blob-type is mandatory for the Azure_V1 backend — this was the
    // silent failure after the upload-url field was resolved.
    const imgBuffer = await image.arrayBuffer();
    const r3 = await fetch(uploadUrl, {
      method: "PUT",
      body: imgBuffer,
      headers: {
        "Content-Type": contentType,
        "x-ms-blob-type": "BlockBlob",
      },
    });
    if (!r3.ok) {
      const t3 = await r3.text().catch(() => "");
      return Response.json({ error: `Step3 blob PUT failed (${r3.status}): ${t3}` }, { status: 502 });
    }

    /* ── Step 4: Start the job ────────────────────────────────────────────── */
    const r4 = await fetch(`${SARVAM}/doc-digitization/job/v1/${job_id}/start`, {
      method: "POST",
      headers: h,
    });
    if (!r4.ok) {
      const t4 = await r4.text().catch(() => "");
      return Response.json({ error: `Step4 start failed (${r4.status}): ${t4}` }, { status: 502 });
    }

    /* ── Step 5: Poll status until terminal state (~48 s budget) ──────────── */
    // States: Accepted | Pending | Running | Completed | PartiallyCompleted | Failed
    let state = "Pending";
    for (let i = 0; i < 24; i++) {
      await new Promise<void>((res) => setTimeout(res, 2000));
      const sr = await fetch(`${SARVAM}/doc-digitization/job/v1/${job_id}/status`, { headers: h });
      const sd = await sr.json().catch(() => ({})) as { job_state?: string };
      state = sd.job_state ?? state;
      if (state === "Completed" || state === "Failed" || state === "PartiallyCompleted") break;
    }
    if (state === "Failed") {
      return Response.json({ error: "Sarvam OCR job failed (job_state=Failed)." }, { status: 502 });
    }

    /* ── Step 6: Get presigned download URL ───────────────────────────────── */
    const r6 = await fetch(`${SARVAM}/doc-digitization/job/v1/${job_id}/download-files`, {
      method: "POST",
      headers: h,
    });
    const t6 = await r6.text();
    if (!r6.ok) return Response.json({ error: `Step6 download-files failed (${r6.status}): ${t6}` }, { status: 502 });

    let d6: { download_urls?: SignedUrlMap } = {};
    try { d6 = JSON.parse(t6); } catch { /* handled below */ }
    const downloadUrl = pickFileUrl(d6.download_urls);
    if (!downloadUrl) {
      return Response.json({ error: `No download URL in download_urls map (state=${state}). Step6=${t6}` }, { status: 502 });
    }

    /* ── Step 7: Download the ZIP and extract text ────────────────────────── */
    const zipRes    = await fetch(downloadUrl);
    if (!zipRes.ok) {
      return Response.json({ error: `Step7 ZIP download failed (${zipRes.status}).` }, { status: 502 });
    }
    const zipBuffer = await zipRes.arrayBuffer();
    const zip       = await JSZip.loadAsync(zipBuffer);

    let text = "";

    // Prefer Markdown output (we requested output_format: "md").
    for (const [name, file] of Object.entries(zip.files) as [string, any][]) {
      if (!file.dir && name.toLowerCase().endsWith(".md")) {
        text = await file.async("text");
        break;
      }
    }

    // Fall back to JSON: structure is { pages: [ { blocks: [ { text } ] } ] }.
    if (!text.trim()) {
      for (const [name, file] of Object.entries(zip.files) as [string, any][]) {
        if (!file.dir && name.toLowerCase().endsWith(".json")) {
          const rawJson = await file.async("text");
          try {
            const parsed = JSON.parse(rawJson);
            if (Array.isArray(parsed?.pages)) {
              text = (parsed.pages as any[])
                .map((pg) =>
                  Array.isArray(pg?.blocks)
                    ? (pg.blocks as any[]).map((b) => b?.text ?? b?.markdown ?? "").join("\n")
                    : (pg?.markdown ?? pg?.text ?? ""))
                .join("\n");
            } else if (Array.isArray(parsed)) {
              text = parsed.map((p: any) => p?.markdown ?? p?.text ?? p?.content ?? "").join("\n");
            } else {
              text = rawJson;
            }
          } catch { text = rawJson; }
          break;
        }
      }
    }

    // Last resort: any HTML output.
    if (!text.trim()) {
      for (const [name, file] of Object.entries(zip.files) as [string, any][]) {
        if (!file.dir && name.toLowerCase().endsWith(".html")) {
          text = (await file.async("text")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
          break;
        }
      }
    }

    return Response.json({ text: text.trim() });

  } catch (err) {
    return Response.json({ error: `Internal OCR error: ${String(err)}` }, { status: 500 });
  }
};
