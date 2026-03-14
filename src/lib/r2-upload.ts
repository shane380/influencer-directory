/**
 * Client-side R2 upload utility.
 * Gets a presigned URL from the server, then uploads directly to R2.
 */

interface UploadOptions {
  /** R2 object key (path in bucket) */
  key: string;
  /** MIME type */
  contentType: string;
  /** File or Blob to upload */
  body: File | Blob;
  /** Optional XHR progress callback (0-100) */
  onProgress?: (percent: number) => void;
}

interface UploadResult {
  /** Public URL of the uploaded file */
  url: string;
  /** R2 object key */
  key: string;
}

/** Upload a file directly to R2 via presigned URL */
export async function uploadToR2({
  key,
  contentType,
  body,
  onProgress,
}: UploadOptions): Promise<UploadResult> {
  // Step 1: Get presigned URL from our API
  const presignRes = await fetch("/api/r2/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, contentType }),
  });

  if (!presignRes.ok) {
    const err = await presignRes.json().catch(() => ({ error: "Failed to get upload URL" }));
    throw new Error(err.error || "Failed to get upload URL");
  }

  const { uploadUrl, publicUrl } = await presignRes.json();

  // Step 2: Upload directly to R2
  if (onProgress) {
    // Use XMLHttpRequest for progress tracking
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", contentType);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      };

      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(body);
    });
  } else {
    // Simple fetch upload (no progress)
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body,
    });

    if (!uploadRes.ok) {
      throw new Error(`Upload failed (${uploadRes.status})`);
    }
  }

  return { url: publicUrl, key };
}
