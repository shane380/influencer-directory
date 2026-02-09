import { google } from "googleapis";

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !key) {
    throw new Error("Missing Google service account credentials");
  }

  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
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
    fields: "id,webViewLink,thumbnailLink",
  });

  // Make file viewable by anyone with the link
  await drive.permissions.create({
    fileId: res.data.id!,
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

export async function deleteFileFromDrive(fileId: string): Promise<void> {
  const drive = getDrive();
  await drive.files.delete({ fileId });
}

export function getFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}
