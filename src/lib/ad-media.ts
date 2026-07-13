/**
 * Browser-side media helpers shared by the ad builder and the review queue's
 * edit form: filename sanitising, 1:1 feed-image detection, video poster
 * frames, and a one-call R2 upload that returns a DraftAsset.
 */

import { uploadToR2 } from "@/lib/r2-upload";
import type { AssetKind, AssetRole, DraftAsset } from "@/types/meta-ads";

export function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.-]+/g, "-").slice(-80);
}

/** Feed images must be square (1:1); allows a 2% tolerance for crop rounding. */
export async function isSquareImage(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (!img.naturalWidth || !img.naturalHeight) return resolve(true);
      const ratio = img.naturalWidth / img.naturalHeight;
      resolve(Math.abs(ratio - 1) <= 0.02);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(true);
    };
    img.src = url;
  });
}

export async function makeVideoThumb(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;
    const fail = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
      } catch {
        fail();
      }
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx || !canvas.width) return fail();
      ctx.drawImage(video, 0, 0);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          resolve(blob);
        },
        "image/jpeg",
        0.85
      );
    };
    video.onerror = fail;
  });
}

export function fileAssetKind(file: File): AssetKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

/**
 * Upload a file (plus a poster frame for videos) to R2 and return the
 * DraftAsset to store on the draft.
 */
export async function uploadAdAsset(
  file: File,
  role: AssetRole,
  kind: AssetKind,
  onProgress?: (percent: number) => void
): Promise<DraftAsset> {
  const key = `meta-ads/${Date.now()}-${sanitizeFileName(file.name)}`;
  const { url } = await uploadToR2({
    key,
    contentType: file.type,
    body: file,
    onProgress,
  });

  let thumbnailUrl: string | null = null;
  if (kind === "video") {
    const thumb = await makeVideoThumb(file);
    if (thumb) {
      const thumbRes = await uploadToR2({
        key: `${key}-thumb.jpg`,
        contentType: "image/jpeg",
        body: thumb,
      });
      thumbnailUrl = thumbRes.url;
    }
  }

  return { role, kind, fileUrl: url, thumbnailUrl };
}
