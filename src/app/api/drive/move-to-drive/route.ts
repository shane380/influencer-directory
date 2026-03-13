import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { findOrCreateFolder, uploadFileToDrive } from "@/lib/google-drive";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const maxDuration = 60;

// Move a file from Supabase Storage to Google Drive
export async function POST(request: NextRequest) {
  const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
  if (!parentId) {
    return NextResponse.json({ error: "Missing GOOGLE_DRIVE_PARENT_FOLDER_ID" }, { status: 500 });
  }

  const { storage_path, file_name, mime_type, folder_name } = await request.json();

  if (!storage_path || !file_name) {
    return NextResponse.json({ error: "storage_path and file_name required" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Download from Supabase Storage
    const { data: fileData, error: dlErr } = await supabase.storage
      .from("creator-uploads")
      .download(storage_path);

    if (dlErr || !fileData) {
      console.error("Storage download failed:", dlErr);
      return NextResponse.json({ error: "Failed to retrieve file from storage" }, { status: 500 });
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());

    // Upload to Google Drive
    const driveFolderName = folder_name || "Campaign References";
    const folderId = await findOrCreateFolder(parentId, driveFolderName);

    const { fileId, webViewLink, thumbnailLink } = await uploadFileToDrive(
      folderId,
      file_name,
      mime_type || "application/octet-stream",
      buffer
    );

    // Build URL — use thumbnail for images, webViewLink for videos
    const isVideo = /\.(mp4|mov|m4v|webm)$/i.test(file_name);
    let url: string;
    if (isVideo) {
      url = webViewLink;
    } else {
      url = thumbnailLink
        ? thumbnailLink.replace(/=s\d+/, "=s1600")
        : `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`;
    }

    // Clean up temp file from Storage
    await supabase.storage.from("creator-uploads").remove([storage_path]);

    return NextResponse.json({ fileId, url, webViewLink });
  } catch (err: any) {
    console.error("Move to Drive failed:", err?.message, err?.stack);
    return NextResponse.json({ error: err.message || "Upload failed" }, { status: 500 });
  }
}
