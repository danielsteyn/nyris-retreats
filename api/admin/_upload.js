// Photo upload handler — uses Vercel Blob's client-upload protocol so the file
// goes directly from the admin browser to Blob storage (bypassing the 4.5 MB
// function body limit on Hobby plan). This endpoint just signs a one-time
// token and acknowledges the completion callback.
//
// Setup: enable Vercel Blob in your project (Storage → Create → Blob → Public →
// Connect). Vercel auto-injects BLOB_READ_WRITE_TOKEN.

import { handleUpload } from "@vercel/blob/client";
import crypto from "crypto";

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"
];
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(200).json({
      ok: false,
      error: "Vercel Blob not configured.",
      hint: "Open your Vercel project → Storage → Create Blob Store → set Read access to Public → Connect to project. Vercel auto-injects BLOB_READ_WRITE_TOKEN.",
      setupUrl: "https://vercel.com/dashboard/stores"
    });
  }

  try {
    const body = req.body;
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Anyone hitting /api/admin/upload could request a token; in production
        // you'd verify session here. For demo, we trust the admin route.
        let payload = {};
        try { payload = clientPayload ? JSON.parse(clientPayload) : {}; } catch {}
        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            propertyId: payload.propertyId || "misc",
            uploadedAt: new Date().toISOString()
          })
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Optional hook — could log to sync_log here. For now, nothing to do;
        // the client gets blob.url back from the upload() promise directly.
      }
    });
    return res.status(200).json(json);
  } catch (e) {
    return res.status(400).json({ ok: false, error: String(e.message || e) });
  }
}
