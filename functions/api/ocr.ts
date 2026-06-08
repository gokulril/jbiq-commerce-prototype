/**
 * Cloudflare Pages Function — POST /api/ocr
 *
 * Sarvam Document Intelligence proxy.
 * Handles both the old S3 backend and the current Azure_v1 backend,
 * trying every known response shape for upload/download URLs.
 *
 * Flow: Create job → Get upload URL → PUT image → Start job
 *       → Poll status → Get download URL → Download ZIP → Extract text
 */

// @ts-ignore — jszip types not available in edge runtime; works fine at runtime
import JSZip from "jszip";

interface Env {
  SARVAM_API_KEY: string;
}

const SARVAM = "https://api.sarvam.ai";

/**
 * Try every known field name and response shape to extract an https:// URL.
 * Covers: top-level string, nested object, arrays, Azure container+SAS combo,
 * and a regex fallback that scans the raw response text.
 */
function extractUrl(raw: string, filename: string): string | undefined {
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(raw); } catch { /* fall through to regex */ }

  // 1. Top-level string URL (most common in current Azure API)
  for (const key of ["upload_url", "file_url", "sas_url", "presigned_url", "url", "href"]) {
    const v = data[key];
    if (typeof v === "string" && v.startsWith("http")) return v;
  }

  // 2. Azure pattern: container URL (no SAS) + separate sas_token field
  for (const key of ["upload_url", "container_url", "blob_url", "url"]) {
    const v = data[key];
    if (typeof v === "string" && v.length > 4 && typeof data.sas_token === "string") {
      const base = v.endsWith("/") ? v : `${v}/`;
      return `${base}${data.blob_name ?? filename}?${data.sas_token}`;
    }
  }

  // 3. Nested object: { upload_url: { url: "https://..." } }
  for (const key of ["upload_url", "upload", "file", "storage"]) {
    const v = data[key];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const inner = v as Record<string, unknown>;
      for (const ik of ["url", "href", "sas_url", "endpoint", "upload_url"]) {
        if (typeof inner[ik] === "string" && (inner[ik] as string).startsWith("http"))
          return inner[ik] as string;
      }
    }
  }

  // 4. Array responses: upload_details / files / items / results
  const arr = [
    ...(Array.isArray(data.upload_details) ? data.upload_details : []),
    ...(Array.isArray(data.files)           ? data.files           : []),
    ...(Array.isArray(data.file_details)    ? data.file_details    : []),
    ...(Array.isArray(data.items)           ? data.items           : []),
    ...(Array.isArray(data.results)         ? data.results         : []),
  ] as Record<string, unknown>[];

  for (const item of arr) {
    for (const key of ["file_url", "upload_url", "sas_url", "presigned_url", "url", "href"]) {
      if (typeof item[key] === "string" && (item[key] as string).startsWith("http"))
        return item[key] as string;
    }
    // Azure array item with container + sas_token
    if (typeof item.container_url === "string" && typeof item.sas_token === "string") {
      const base = (item.container_url as string).endsWith("/")
        ? item.container_url as string
        : `${item.container_url}/`;
      return `${base}${item.blob_name ?? filename}?${item.sas_token}`;
    }
  }

  // 5. Regex on raw text — last resort, handles any encoding quirks
  const urlPatterns = [
    /"upload_url"\s*:\s*"(https?:(?:[^"\\]|\\.)*)"/,
    /"file_url"\s*:\s*"(https?:(?:[^"\\]|\\.)*)"/,
    /"sas_url"\s*:\s*"(https?:(?:[^"\\]|\\.)*)"/,
    /"presigned_url"\s*:\s*"(https?:(?:[^"\\]|\\.)*)"/,
    /"url"\s*:\s*"(https?:(?:[^"\\]|\\.)*)"/,
  ];
  for (const pat of urlPatterns) {
    const m = raw.match(pat);
    if (m) {
      return m[1]
        .replace(/\\u0026/g, "&")
        .replace(/\\u003d/g, "=")
        .replace(/\\u002b/g, "+")
        .replace(/\\"/g, '"')
        .replace(/\\\//g, "/");
    }
  }

  return undefined;
}

/** Same logic for the step-6 download URL. */
function extractDownloadUrl(raw: string): string | undefined {
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(raw); } catch { /* ignore */ }

  for (const key of ["download_url", "file_url", "url", "href"]) {
    if (typeof data[key] === "string" && (data[key] as string).startsWith("http"))
      return data[key] as string;
  }

  const arr = [
    ...(Array.isArray(data.download_details) ? data.download_details : []),
    ...(Array.isArray(data.files)             ? data.files             : []),
    ...(Array.isArray(data.items)             ? data.items             : []),
  ] as Record<string, unknown>[];

  for (const item of arr) {
    for (const key of ["file_url", "download_url", "url", "href"]) {
      if (typeof item[key] === "string" && (item[key] as string).startsWith("http"))
        return item[key] as string;
    }
  }

  // Regex fallback
  const m = raw.match(/"(?:download_url|file_url|url)"\s*:\s*"(https?:(?:[^"\\]|\\.)*)"/);
  if (m) return m[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");

  return undefined;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const apiKey = context.env.SARVAM_API_KEY;
  if (!apiKey) return Response.json({ error: "SARVAM_API_KEY not configured." }, { status: 500 });

  let image: File | null = null;
  try {
    const form = await context.request.formData();
    const raw = form.get("image");
    if (raw instanceof File && raw.size > 0) image = raw;
  } catch {
    return Response.json({ error: "Could not parse multipart body." }, { status: 400 });
  }
  if (!image) return Response.json({ error: "Missing or empty image field." }, { status: 400 });

  const h  = { "api-subscription-key": apiKey };
  const jh = { "Content-Type": "application/json", ...h };
  const filename = image.name || "photo.jpg";

  try {
    /* ── Step 1: Create job ───────────────────────────────────────────────── */
    const r1  = await fetch(`${SARVAM}/doc-digitization/job/v1`, {
      method: "POST", headers: jh,
      body: JSON.stringify({ job_parameters: { language: "hi-IN", output_format: "md" } }),
    });
    const t1 = await r1.text();
    if (!r1.ok) return Response.json({ error: `Step1 failed (${r1.status}): ${t1}` }, { status: 500 });

    let d1: Record<string, unknown> = {};
    try { d1 = JSON.parse(t1); } catch {
      return Response.json({ error: `Step1 non-JSON: ${t1}` }, { status: 500 });
    }
    const job_id = d1.job_id as string | undefined;
    if (!job_id) return Response.json({ error: `No job_id in step1: ${t1}` }, { status: 500 });

    /* ── Step 2: Get upload URL ──────────────────────────────────────────── */
    // Some API versions return upload_url directly in the step-1 response
    let uploadUrl = extractUrl(t1, filename);

    let t2 = "";
    if (!uploadUrl) {
      const r2 = await fetch(`${SARVAM}/doc-digitization/job/v1/upload-files`, {
        method: "POST", headers: jh,
        body: JSON.stringify({ job_id, files: [filename] }),
      });
      t2 = await r2.text();
      uploadUrl = extractUrl(t2, filename);
    }

    if (!uploadUrl) {
      // Surface FULL raw responses so we can see exactly what Sarvam returned
      return Response.json({
        error: `No upload URL found. Step1=${t1} ||| Step2=${t2}`,
      }, { status: 500 });
    }

    /* ── Step 3: Upload image ────────────────────────────────────────────── */
    const imgBuffer = await image.arrayBuffer();
    const r3 = await fetch(uploadUrl, {
      method: "PUT", body: imgBuffer,
      headers: { "Content-Type": image.type || "image/jpeg" },
    });
    if (!r3.ok) {
      const t3 = await r3.text().catch(() => "");
      return Response.json({ error: `Image PUT failed (${r3.status}): ${t3}` }, { status: 502 });
    }

    /* ── Step 4: Start job ───────────────────────────────────────────────── */
    await fetch(`${SARVAM}/doc-digitization/job/v1/${job_id}/start`, {
      method: "POST", headers: jh, body: "{}",
    });

    /* ── Step 5: Poll until Completed / Failed (max ~50 s) ──────────────── */
    let state = "Pending";
    for (let i = 0; i < 25; i++) {
      await new Promise<void>((res) => setTimeout(res, 2000));
      const sr  = await fetch(`${SARVAM}/doc-digitization/job/v1/${job_id}/status`, { headers: h });
      const sd  = await sr.json() as { job_state?: string };
      state = sd.job_state ?? state;
      if (state === "Completed" || state === "Failed" || state === "PartiallyCompleted") break;
    }
    if (state === "Failed") return Response.json({ error: "Sarvam OCR job failed." }, { status: 500 });

    /* ── Step 6: Get download URL ────────────────────────────────────────── */
    const r6  = await fetch(`${SARVAM}/doc-digitization/job/v1/${job_id}/download-files`, {
      method: "POST", headers: jh, body: JSON.stringify({ job_id }),
    });
    const t6 = await r6.text();
    const downloadUrl = extractDownloadUrl(t6);
    if (!downloadUrl) {
      return Response.json({ error: `No download URL: ${t6}` }, { status: 500 });
    }

    /* ── Step 7: Download ZIP and extract text ───────────────────────────── */
    const zipRes    = await fetch(downloadUrl);
    const zipBuffer = await zipRes.arrayBuffer();
    const zip       = await JSZip.loadAsync(zipBuffer);

    let text = "";

    // Prefer Markdown output
    for (const [name, file] of Object.entries(zip.files) as [string, any][]) {
      if (!file.dir && name.endsWith(".md")) {
        text = await file.async("text");
        break;
      }
    }

    // Fall back to JSON
    if (!text) {
      for (const [name, file] of Object.entries(zip.files) as [string, any][]) {
        if (!file.dir && name.endsWith(".json")) {
          const rawJson = await file.async("text");
          try {
            const parsed = JSON.parse(rawJson);
            if (Array.isArray(parsed)) {
              text = parsed.map((p: any) => p.markdown ?? p.text ?? p.content ?? "").join("\n");
            } else if (parsed?.pages) {
              text = (parsed.pages as any[]).map((p: any) => p.markdown ?? p.text ?? "").join("\n");
            } else {
              text = rawJson;
            }
          } catch { text = rawJson; }
          break;
        }
      }
    }

    return Response.json({ text: text.trim() });

  } catch (err) {
    return Response.json({ error: `Internal OCR error: ${String(err)}` }, { status: 500 });
  }
};
