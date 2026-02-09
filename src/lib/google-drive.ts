import { google } from "googleapis";

function getCredentials(): { email: string; key: string } {
  // Preferred: base64-encoded JSON key file (avoids Vercel newline issues)
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (b64) {
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
    return { email: json.client_email, key: json.private_key };
  }

  // Fallback: separate env vars
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "";
  const key = raw.replace(/\\n/g, "\n").replace(/^["']|["']$/g, "").trim();
  return { email, key };
}

function getAuth() {
  const { email, key } = getCredentials();

  if (!email || !key) {
    throw new Error("Missing Google service account credentials");
  }

  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

function getDrive() {
  return google.drive({ version: "v3", auth: getAuth() });
}

export async function createInfluencerFolder(
  name: string,
  handle: string
): Promise<string> {
  const drive = getDrive();
  const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
  if (!parentId) throw new Error("Missing GOOGLE_DRIVE_PARENT_FOLDER_ID");

  const folderName = `${name} (@${handle})`;

  const res = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    supportsAllDrives: true,
    fields: "id",
  });

  return res.data.id!;
}

export async function uploadFileToDrive(
  folderId: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer
): Promise<{ fileId: string; webViewLink: string; thumbnailLink: string | null }> {
  const drive = getDrive();
  const { Readable } = await import("stream");

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    supportsAllDrives: true,
    fields: "id,webViewLink,thumbnailLink",
  });

  // Make file viewable by anyone with the link
  await drive.permissions.create({
    fileId: res.data.id!,
    supportsAllDrives: true,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });

  return {
    fileId: res.data.id!,
    webViewLink: res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`,
    thumbnailLink: res.data.thumbnailLink || null,
  };
}

export async function createResumableUpload(
  folderId: string,
  fileName: string,
  mimeType: string,
  origin: string
): Promise<string> {
  const auth = getAuth();
  const token = await auth.getAccessToken();

  // Initiate resumable upload session
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.token}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": mimeType,
        Origin: origin,
      },
      body: JSON.stringify({
        name: fileName,
        parents: [folderId],
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create resumable upload: ${text}`);
  }

  const uploadUrl = res.headers.get("Location");
  if (!uploadUrl) throw new Error("No upload URL returned");
  return uploadUrl;
}

export async function finalizeUpload(
  fileId: string
): Promise<{ webViewLink: string; thumbnailLink: string | null }> {
  const drive = getDrive();

  // Set permissions
  await drive.permissions.create({
    fileId,
    supportsAllDrives: true,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });

  // Get file details
  const file = await drive.files.get({
    fileId,
    supportsAllDrives: true,
    fields: "webViewLink,thumbnailLink",
  });

  return {
    webViewLink: file.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
    thumbnailLink: file.data.thumbnailLink || null,
  };
}

export async function deleteFileFromDrive(fileId: string): Promise<void> {
  const drive = getDrive();
  await drive.files.delete({ fileId, supportsAllDrives: true });
}

export function getFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}
