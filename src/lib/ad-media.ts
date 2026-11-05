/**
 * Browser-side media helpers shared by the ad builder and the review queue's
 * edit form: filename sanitising, feed-ratio (1:1 / 4:5) detection, video poster
 * frames, and a one-call R2 upload that returns a DraftAsset.
 */

import { uploadToR2 } from "@/lib/r2-upload";
import type { AssetKind, AssetRole, DraftAsset } from "@/types/meta-ads";

export function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.-]+/g, "-").slice(-80);
}

/** Aspect targets for the creative slots, as width / height. */
export const FEED_ASPECT = 1;
/**
 * Portrait feed alternative. Meta's Ads Guide recommends 4:5 (1440×1800) for
 * Instagram and Facebook Feed images; feeds accept anything from 4:5 to 1.91:1.
 */
export const PORTRAIT_FEED_ASPECT = 4 / 5;
/** Ratios the feed slot accepts as-is; anything else is cropped to one of them. */
export const FEED_ASPECTS = [FEED_ASPECT, PORTRAIT_FEED_ASPECT];
export const VERTICAL_ASPECT = 9 / 16;

/** Allowed deviation from a target ratio before a file needs cropping. */
const ASPECT_TOLERANCE = 0.02;

/** True when `ratio` is within tolerance of `aspect`. */
export function closeToAspect(ratio: number, aspect: number): boolean {
  return Math.abs(ratio / aspect - 1) <= ASPECT_TOLERANCE;
}

/**
 * Native width / height of an image or video file, or null when the browser
 * can't read it (the caller then treats the file as acceptable and lets Meta
 * validate it).
 */
export function mediaRatio(file: File): Promise<number | null> {
  if (file.type.startsWith("video/")) {
    return new Promise((resolve) => {
      const v = document.createElement("video");
      const url = URL.createObjectURL(file);
      v.preload = "metadata";
      v.muted = true;
      v.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        if (!v.videoWidth || !v.videoHeight) return resolve(null);
        resolve(v.videoWidth / v.videoHeight);
      };
      v.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      v.src = url;
    });
  }
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (!img.naturalWidth || !img.naturalHeight) return resolve(null);
      resolve(img.naturalWidth / img.naturalHeight);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * True when an image or video already matches the target aspect closely enough to skip
 * cropping. Allows 2% for rounding — a match uploads the original bytes
 * untouched rather than re-encoding it through a canvas.
 */
export async function matchesAspect(file: File, aspect: number): Promise<boolean> {
  const ratio = await mediaRatio(file);
  return ratio === null || closeToAspect(ratio, aspect);
}

/**
 * Which of `aspects` the file already matches (first match wins), or null when
 * it matches none and needs cropping. Unreadable files count as matching the
 * first option, mirroring `matchesAspect`.
 */
export async function detectAspect(file: File, aspects: number[]): Promise<number | null> {
  const ratio = await mediaRatio(file);
  if (ratio === null) return aspects[0] ?? null;
  return aspects.find((a) => closeToAspect(ratio, a)) ?? null;
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
      // Meta shows this frame as the ad's thumbnail, so keep it close to the
      // video's own quality — it's captured at full native resolution.
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          resolve(blob);
        },
        "image/jpeg",
        0.92
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
