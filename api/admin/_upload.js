// Photo upload handler — accepts base64-encoded file from the admin UI,
// uploads to Vercel Blob, returns the public CDN URL.
//
// Why base64 over multipart? Vercel functions have a 4.5 MB request body limit
// on Hobby; base64 inflates by ~33%, so usable image size is ~3.3 MB. That's
// fine for typical property photos. For larger images, the admin UI tells the
// user to compress (or paste a URL instead).
//
// Setup: enable Vercel Blob in your project (Storage → Create Blob Store →
// Connect). Vercel auto-injects BLOB_READ_WRITE_TOKEN.

import { put } from "@vercel/blob";
import crypto from "crypto";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB after decode

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(200).json({
      ok: false,
      error: "Vercel Blob not configured.",
      hint: "Open your Vercel project → Storage → Create Blob Store → Connect to project. Vercel auto-injects BLOB_READ_WRITE_TOKEN, then redeploy.",
      setupUrl: "https://vercel.com/dashboard/stores"
    });
  }

  try {
    const { dataUrl, filename = "photo", propertyId = "misc", caption } = req.body || {};
    if (!dataUrl || typeof dataUrl !== "string") {
      return res.status(400).json({ ok: false, error: "dataUrl required" });
    }

    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return res.status(400).json({ ok: false, error: "invalid data URL format" });

    const contentType = m[1];
    if (!ALLOWED_TYPES.has(contentType)) {
      return res.status(400).json({ ok: false, error: `Unsupported image type: ${contentType}. Use JPEG, PNG, WebP, AVIF, or GIF.` });
    }

    const buffer = Buffer.from(m[2], "base64");
    if (buffer.length === 0) return res.status(400).json({ ok: false, error: "empty file" });
    if (buffer.length > MAX_BYTES) {
      return res.status(400).json({
        ok: false,
        error: `File is ${(buffer.length / 1024 / 1024).toFixed(1)} MB; maximum is ${MAX_BYTES / 1024 / 1024} MB. Compress at https://squoosh.app or paste a URL instead.`
      });
    }

    const ext = (contentType.split("/")[1] || "bin").toLowerCase();
    const id = crypto.randomBytes(8).toString("hex");
    // Strip any existing extension from the original filename, then sanitize.
    // (We append the canonical ext from contentType to avoid e.g. "test.png.png".)
    const baseName = String(filename).replace(/\.[^./\\]+$/, "");
    const safeName = baseName.replace(/[^a-z0-9._-]/gi, "_").slice(0, 50) || "photo";
    const path = `photos/${encodeURIComponent(propertyId).replace(/%/g, "_")}/${id}-${safeName}.${ext}`;

    const blob = await put(path, buffer, {
      access: "public",
      contentType,
      addRandomSuffix: false
    });

    return res.status(200).json({
      ok: true,
      url: blob.url,
      pathname: blob.pathname,
      contentType,
      size: buffer.length,
      caption: caption || ""
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}

// Allow up to ~6 MB JSON bodies for base64-encoded images.
// (Vercel Hobby caps at 4.5 MB total; this just declares intent.)
export const config = {
  api: {
    bodyParser: { sizeLimit: "6mb" }
  }
};
