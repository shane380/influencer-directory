import { NextRequest, NextResponse } from "next/server";
import { findOrCreateFolder, uploadFileToDrive, deleteFileFromDrive } from "@/lib/google-drive";

// POST: Upload a campaign banner image to Google Drive
export async function POST(request: NextRequest) {
  const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
  if (!parentId) {
    return NextResponse.json({ error: "Missing GOOGLE_DRIVE_PARENT_FOLDER_ID" }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  try {
    // Find or create "Campaign Banners" folder under the root Drive folder
    const folderId = await findOrCreateFolder(parentId, "Campaign Banners");

    const buffer = Buffer.from(await file.arrayBuffer());
    const { fileId, webViewLink, thumbnailLink } = await uploadFileToDrive(
      folderId,
      file.name,
      file.type,
      buffer
    );

    // Build a direct-view thumbnail URL from Drive
    const url = thumbnailLink
      ? thumbnailLink.replace(/=s\d+/, "=s1600")
      : `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`;

    return NextResponse.json({ fileId, url, webViewLink });
  } catch (err: any) {
    console.error("Banner upload failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Remove a banner image from Google Drive
export async function DELETE(request: NextRequest) {
  const { fileId } = await request.json();
  if (!fileId) {
    return NextResponse.json({ error: "fileId required" }, { status: 400 });
  }

  try {
    await deleteFileFromDrive(fileId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Banner delete failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
